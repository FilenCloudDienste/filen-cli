#!/usr/bin/env node

import { checkInjectedBuildInfo } from "./buildInfo"
import { App, InterfaceAdapter } from "./app"
import { read } from "read"
import { CompleterResult } from "readline"
import { Autocompletion } from "./featureInterfaces/fs/autocompletion"
import { wrapRedTerminalText } from "./interface/util"

if (!checkInjectedBuildInfo()) {
	console.error("Build info not injected correctly!")
	process.exit(1)
}

class ConsoleInterfaceAdapter implements InterfaceAdapter {
	private hasReceivedKeyPresses = 0

	private interruptListeners: (() => void)[] = []

	constructor() {
		process.stdin.on("keypress", () => {
			this.hasReceivedKeyPresses++
		})

		let lastInterruptTimestamp = 0
		let consecutiveInterrupts = 0
		process.on("SIGINT", () => {
			if (this.interruptListeners.length > 0) this.interruptListeners[0]!()
			this.interruptListeners = []

			const now = new Date().getMilliseconds()
			if (now - lastInterruptTimestamp < 500) {
				consecutiveInterrupts++
				if (consecutiveInterrupts === 2) console.log("\nPress 3 consecutive times to close the application")
				if (consecutiveInterrupts >= 3) process.exit()
			} else {
				consecutiveInterrupts = 1
			}
			lastInterruptTimestamp = now
		})
	}

	out(message: string) {
		console.log(message)
	}

	outJson(json: any) {
		console.log(json)
	}

	errOut(message: string) {
		console.error(wrapRedTerminalText(message))
	}

	err(error: any) {
		console.error(wrapRedTerminalText(error instanceof Error ? error.stack : error))
	}

	prompt(message: string, obfuscate: boolean, history: string[] | undefined, allowExit: boolean, autocompletion: Autocompletion | null): Promise<string> {
		return new Promise((resolve) => {
			this.hasReceivedKeyPresses = 0
			const cancel = () => {
				if (allowExit && this.hasReceivedKeyPresses <= 1) {
					process.exit()
				} else {
					resolve("")
				}
			}
			if (allowExit) {
				this.addInterruptListener(() => cancel())
			}
			read({
				prompt: message,
				silent: obfuscate,
				replace: obfuscate ? "*" : undefined,
				completer: (input: string, callback: (err: undefined, result: CompleterResult) => void) => {
					if (autocompletion !== undefined) {
						autocompletion!.autocomplete(input).then(result => callback(undefined, result))
					} else {
						callback(undefined, [[], input])
					}
				},
				history
			}).then(input => {
				autocompletion?.clearPrefetchedResults()
				resolve(input)
			}).catch(e => {
				if (e instanceof Error && e.message === "canceled") {
					cancel()
				} else {
					throw e
				}
			})
		})
	}

	addInterruptListener(listener: () => void) {
		this.interruptListeners.unshift(listener)
	}
}

const app = new App(process.argv.slice(2), new ConsoleInterfaceAdapter())
app.main().then(() => process.exit())