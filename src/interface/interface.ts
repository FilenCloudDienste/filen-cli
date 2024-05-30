import readline from "node:readline"
import { Autocompletion } from "../fs/autocompletion"
import { InterruptHandler } from "../fs/interrupt"

export const readlineInterface = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	completer: (input: string) => Autocompletion.instance?.autocomplete(input) ?? [[], input]
})

process.stdin.on("keypress", () => {
	Autocompletion.instance?.prefetchForInput(readlineInterface.line)
	hasReceivedInput = readlineInterface.line.length > 0
})

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

/**
 * Global error output method
 * @param message
 */
export function err(message: string) {
	errorOccurred = true
	// red color: see https://stackoverflow.com/a/41407246
	console.error("\x1b[31m" + message + "\x1b[0m")
}

/**
 * Global error output method. Exist the application
 * @param message
 */
export function errExit(message: string): never {
	err(message)
	process.exit()
}

/**
 * Global input prompting method
 * @param message The message to print before the prompt
 * @param allowExit Whether to allow to exit the application here via `^C`
 */
export async function prompt(message: string | undefined, allowExit: boolean = false) {
	return new Promise<string>((resolve) => {
		const signal = allowExit ? InterruptHandler.instance.createAbortSignal() : undefined
		readlineInterface.question(message ?? "", { signal }, (input) => {
			Autocompletion.instance?.clearPrefetchedResults()
			resolve(input)
		})
		hasReceivedInput = false
		signal?.addEventListener("abort", () => {
			if (!hasReceivedInput) process.exit()
			else resolve("")
		})
	})
}

let hasReceivedInput = false
