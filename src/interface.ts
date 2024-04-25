import readline from "node:readline"
import { Autocompletion } from "./autocompletion"

export const readlineInterface = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	completer: (input: string) => Autocompletion.instance?.autocomplete(input) ?? [[], input]
})

process.stdin.on("keypress", () => {
	Autocompletion.instance?.prefetchForInput(readlineInterface.line)
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
export function errExit(message: string) {
	err(message)
	process.exit()
}

/**
 * Global input prompting method
 * @param message
 */
export async function prompt(message?: string) {
	return new Promise<string>((resolve) => {
		readlineInterface.question(message ?? "", (input) => {
			Autocompletion.instance?.clearPrefetchedResults()
			resolve(input)
		})
	})
}