import readline from "node:readline"
import { Autocompletion } from "../featureInterfaces/fs/autocompletion"
import { InterruptHandler } from "./interrupt"
import * as fs from "node:fs"
import { formatTimestamp } from "./util"
import { Semaphore } from "../util/semaphore"
import { version } from "../buildInfo"

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

/**
 * File to print logs (set via `--logs-file` flag)
 */
export let logsFile: string | undefined = undefined

export async function setOutputFlags(quietFlag: boolean, verboseFlag: boolean, logsFileFlag: string | undefined) {
	quiet = quietFlag
	verbose = verboseFlag
	logsFile = logsFileFlag

	if (logsFile === undefined) return
	try {
		if ((await fs.promises.readFile(logsFile)).length > 1) {
			await writeLog("", "newlines")
		}
	} catch (e) {
		// do nothing
	}
	await writeLog(`Filen CLI ${version}\n> ${process.argv.join(" ")}\n`, "log")
}

const writeLogSemaphore = new Semaphore(1)
async function writeLog(message: string, type: "newlines" | "log" | "input" | "error") {
	if (logsFile === undefined) return
	await writeLogSemaphore.acquire()
	try {
		const str = type === "newlines" ? "\n\n" : message.split("\n").map(line => `[${formatTimestamp(new Date().getTime())}] ${type === "log" ? "[LOG]" : type === "error" ? "[ERR]" : "[IN ]"} ${line}\n`).join("")
		await fs.promises.appendFile(logsFile, str)
	} finally {
		writeLogSemaphore.release()
	}
}

/**
 * Global output method
 * @param message
 */
export function out(message: string) {
	console.log(message)
	writeLog(message, "log")
}

/**
 * Global output method, only prints if `--verbose` flag is set
 */
export function outVerbose(message: string) {
	if (verbose) console.log(message)
	writeLog(message, "log")
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
		const errorStr = underlyingError instanceof Error && underlyingError.name === "Error" ? underlyingError.message : String(underlyingError)
		str += `Error trying to ${messageOrAction}: ${errorStr}`
	}
	if (additionalMessage !== undefined) {
		str += `. (${additionalMessage})`
	}

	// red color: see https://stackoverflow.com/a/41407246
	console.error("\x1b[31m" + str + "\x1b[0m")

	if (underlyingError !== undefined) {
		console.error(underlyingError instanceof Error ? underlyingError.stack : underlyingError)
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
				writeLog(message, "input")
				writeLog(" ".repeat(message.length-1) + "> " + (obfuscate ? "***" : input), "input")
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
