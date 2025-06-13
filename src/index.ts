#!/usr/bin/env node

import { checkInjectedBuildInfo } from "./buildInfo"
import { read } from "read"
import { CompleterResult } from "readline"
import { wrapRedTerminalText } from "./framework/util"
import { InterfaceAdapter } from "./framework/app"
import { app } from "./app/app"

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

	outJson(json: unknown) {
		console.log(json)
	}

	errOut(message: string) {
		console.error(wrapRedTerminalText(message))
	}

	err(error: unknown) {
		console.error(wrapRedTerminalText((error instanceof Error ? error.stack : undefined) ?? String(error)))
	}

	prompt(message: string, obfuscate: boolean, history: string[] | undefined, allowExit: boolean, autocomplete: (input: string) => Promise<CompleterResult>): Promise<string> {
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
					autocomplete(input).then(result => callback(undefined, result))
				},
				history
			})
				.then(input => resolve(input))
				.catch(e => {
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

const _app = app(process.argv.slice(2), new ConsoleInterfaceAdapter()).app()
_app.main().then((success) => process.exit(success ? 0 : 1))