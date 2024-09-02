import readline from "node:readline"
import { Autocompletion } from "../featureInterfaces/fs/autocompletion"
import { InterruptHandler } from "./interrupt"

/**
 * amount of output calls until input should be obfuscated (-1 = don't obfuscate, 0 = obfuscate, 1 = obfuscate except first output, ...)
 */
let obfuscateInput = -1

export const readlineInterface = (() => {
	try {
		const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
				completer: (input: string) => Autocompletion.instance?.autocomplete(input) ?? [[], input]
			})
		;(rl as any)._writeToOutput = (c: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
			(rl as any).output?.write(obfuscateInput === 0 ? c.replace(/./ /* don't replace newlines */, "") : c) // eslint-disable-line @typescript-eslint/no-explicit-any
			if (obfuscateInput > 0) obfuscateInput -= 1
		}
		return rl
	} catch (e) {
		errExit("initialize console interface", e)
	}
})()

process.stdin.on("keypress", () => {
	Autocompletion.instance?.prefetchForInput(readlineInterface.line)
	hasReceivedInput = readlineInterface.line.length > 0
})

/**
 * `--quiet` flag is set
 */
export let quiet = false

/**
 * `--verbose` flag is set
 */
export let verbose = false

export function setOutputFlags(quietFlag: boolean, verboseFlag: boolean) {
	quiet = quietFlag
	verbose = verboseFlag
}

/**
 * Global output method
 * @param message
 */
export function out(message: string) {
	console.log(message)
}

/**
 * Global output method for JSON
 */
//eslint-disable-next-line @typescript-eslint/no-explicit-any
export function outJson(json: any) {
	console.log(json)
}

export let errorOccurred = false
export function resetErrorOccurred() {
	errorOccurred = false
}

/**
 * Global error output method
 * @param messageOrAction A simple message to display (e.g. "No such file"), or the failed action, when used together with `underlyingError (e.g. "authenticate").
 * @param underlyingError Optionally, the underlying error that was thrown.
 * @param additionalMessage Optionally, an additional message to display: "Error trying to {action}: {e}. ({additionalMessage})"
 */
export function err(messageOrAction: string, underlyingError?: unknown, additionalMessage?: string) {
	errorOccurred = true

	let str = ""
	if (underlyingError === undefined) {
		str += messageOrAction
	} else {
		const errorStr = underlyingError instanceof Error ? underlyingError.message : String(underlyingError)
		str += `Error trying to ${messageOrAction}: ${errorStr}`
	}
	if (additionalMessage !== undefined) {
		str += `. (${additionalMessage})`
	}

	// red color: see https://stackoverflow.com/a/41407246
	console.error("\x1b[31m" + str + "\x1b[0m")

	if (underlyingError !== undefined) {
		console.error(underlyingError)
	}
}

/**
 * Global error output method. Exits the application
 * @see err
 */
export function errExit(messageOrAction: string, underlyingError?: unknown, additionalMessage?: string): never {
	err(messageOrAction, underlyingError, additionalMessage)
	process.exit(1)
}

/**
 * Global input prompting method
 * @param message The message to print before the prompt
 * @param allowExit Whether to allow to exit the application here via `^C`
 */
export async function prompt(message: string, allowExit: boolean = false, obfuscate: boolean = false) {
	return new Promise<string>((resolve) => {
		const signal = allowExit ? InterruptHandler.instance.createAbortSignal() : undefined
		if (obfuscate) obfuscateInput = 1
		try {
			readlineInterface.question(message, { signal }, (input) => {
				Autocompletion.instance?.clearPrefetchedResults()
				obfuscateInput = -1
				if (obfuscate) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(readlineInterface as any).history = (readlineInterface as any).history.slice(1)
				}
				resolve(input)
			})
		} catch (e) {
			errExit("prompt for user input", e, "maybe you're in an environment without stdin, like a Docker container")
		}
		hasReceivedInput = false
		signal?.addEventListener("abort", () => {
			if (!hasReceivedInput) process.exit()
			else resolve("")
		})
	})
}

let hasReceivedInput = false

/**
 * Global confirmation prompting method
 * @param action The action to include in the prompt (e.g. "delete file.txt"), or undefined for a generic prompt.
 */
export async function promptConfirm(action: string | undefined) {
	return new Promise<boolean>((resolve) => {
		prompt(action !== undefined ? `Are you sure you want to ${action}? [y/N] ` : "Are you sure? [y/N] ").then(result => {
			resolve(result.toLowerCase() === "y")
		})
	})
}
