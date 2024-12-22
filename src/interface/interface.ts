import { Autocompletion } from "../featureInterfaces/fs/autocompletion"
import { InterruptHandler } from "./interrupt"
import * as fs from "node:fs"
import { formatTimestamp, wrapRedTerminalText } from "./util"
import { CompleterResult } from "node:readline"
import { read } from "./read"
import { Mutex } from "async-mutex"
import * as buffer from "buffer"
import { randomUUID } from "node:crypto"

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
 * Setup later writing of logs.
 * @param logsFile Where to write logs, or undefined if logs shall not be written.
 */
export function setupLogs(logsFile: string | undefined = undefined) {
	if (logsFile === undefined) return
	writeLogsToDisk = () => {
		try {
			if (fs.readFileSync(logsFile).length > 1) logs = "\n\n" + logs
		} catch (e) {
			// do nothing
		}
		fs.appendFileSync(logsFile, logs)
	}
	process.on("exit", () => writeLogsToDisk!())
	writeLog(`> ${process.argv.join(" ")}`, "log")
}
let writeLogsToDisk: () => void = () => {}

let logs = ""
const logsMutex = new Mutex()
function writeLog(message: string, type: "log" | "input" | "error") {
	logsMutex.acquire().then(() => {
		logs += message.split("\n").map(line => `${formatTimestamp(new Date().getTime())} ${type === "log" ? "[LOG]" : type === "error" ? "[ERR]" : "[IN ]"} ${line}\n`).join("")
		if (buffer.constants.MAX_STRING_LENGTH - logs.length < 10_000) {
			// the in-memory log file is too large, flush it to disk
			const randomTag = randomUUID()
			logs += `                              (these logs are continued at #${randomTag})\n`
			writeLogsToDisk?.()
			logs = `                              (this is the continuation of #${randomTag})\n`
		}
		logsMutex.release()
	})
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

	console.error(wrapRedTerminalText(str))

	if (underlyingError !== undefined) {
		console.error(underlyingError instanceof Error ? underlyingError.stack : underlyingError)
	}

	writeLog(str, "error")
	if (underlyingError !== undefined) writeLog((underlyingError instanceof Error ? underlyingError.stack : undefined) ?? String(underlyingError), "error")
}

/**
 * Global error output method. Exits the application
 * @see err
 */
export function errExit(messageOrAction: string, underlyingError?: unknown, additionalMessage?: string): never {
	err(messageOrAction, underlyingError, additionalMessage)
	process.exit(1)
}

// appended to in read()
const readlineHistory: string[] = []

/**
 * Global input prompting method
 * @param message The message to print before the prompt
 * @param options Options:
 * @param options.allowExit Whether to allow to exit the application here via `^C`
 * @param options.obfuscate Whether to obfuscate the input (for password input)
 * @param options.useHistory Whether to read from and append to the history
 */
export async function prompt(message: string, options: { allowExit?: boolean, obfuscate?: boolean, useHistory?: boolean } = {}) {
	return new Promise<string>((resolve) => {
		const cancel = () => {
			if (options.allowExit && hasReceivedKeyPresses <= 1) {
				process.exit()
			} else {
				resolve("")
			}
		}
		if (options.allowExit) {
			InterruptHandler.instance.addListener(() => cancel())
		}
		try {
			read({
				prompt: message,
				silent: options.obfuscate,
				replace: options.obfuscate ? "*" : undefined,
				completer: (input: string, callback: (err: undefined, result: CompleterResult) => void) => {
					if (Autocompletion.instance !== undefined) {
						Autocompletion.instance!.autocomplete(input).then(result => callback(undefined, result))
					} else {
						callback(undefined, [[], input])
					}
				},
				history: options.useHistory ? readlineHistory : undefined
			}).then(input => {
				Autocompletion.instance?.clearPrefetchedResults()
				writeLog(message, "log")
				writeLog(" ".repeat(message.length) + (options.obfuscate ? "***" : input), "input")
				resolve(input)
			}).catch(e => {
				if (e instanceof Error && e.message === "canceled") {
					cancel()
				} else {
					throw e
				}
			})
		} catch (e) {
			errExit("prompt for user input", e, "maybe you're in an environment without stdin, like a Docker container")
		}
		hasReceivedKeyPresses = 0
	})
}

// don't exit the program on ^C when there was user input
let hasReceivedKeyPresses = 0
process.stdin.on("keypress", () => {
	hasReceivedKeyPresses++
})

/**
 * Global confirmation prompting method
 * @param action The action to include in the prompt (e.g. "delete file.txt"), or undefined for a generic prompt.
 */
export async function promptConfirm(action: string | undefined) {
	return promptYesNo(action !== undefined ? `Are you sure you want to ${action}?` : "Are you sure?")
}

/**
 * Global confirmation prompting method
 * @param question The question to include in the prompt
 * @param defaultAnswer The default answer if there's no input
 */
export async function promptYesNo(question: string, defaultAnswer: boolean = false) {
	return new Promise<boolean>((resolve) => {
		prompt(`${question} ${defaultAnswer ? "[Y/n]" : "[y/N]"} `).then(result => {
			const input = result.toLowerCase()
			if (input === "n" || input === "no") {
				resolve(false)
			} else if (input === "y" || input === "yes") {
				resolve(true)
			} else if (input.trim() === "") {
				resolve(defaultAnswer)
			} else {
				err("Invalid input, please enter 'y' or 'n'!")
				promptYesNo(question, defaultAnswer).then(resolve)
			}
		})
	})
}
