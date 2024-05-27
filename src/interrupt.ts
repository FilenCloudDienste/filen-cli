import { out, readlineInterface } from "./interface"

/**
 * Handles SIGINT signals.
 */
export class InterruptHandler {
	private static _instance?: InterruptHandler
	public static get instance() {
		if (this._instance === undefined) this._instance = new InterruptHandler()
		return this._instance
	}

	private listeners: (() => void)[] = []

	public constructor() {
		if (process.platform === "win32") {
			readlineInterface.on("SIGINT", function() {
				process.emit("SIGINT")
			})
		}
		let lastInterruptTimestamp = 0
		let consecutiveInterrupts = 0
		process.on("SIGINT", () => {
			if (this.listeners.length > 0) this.listeners[0]!()
			this.listeners = []

			const now = new Date().getMilliseconds()
			if (now - lastInterruptTimestamp < 500) {
				consecutiveInterrupts++
				if (consecutiveInterrupts === 2) out("\nPress 3 consecutive times to close the application")
				if (consecutiveInterrupts >= 3) process.exit()
			} else {
				consecutiveInterrupts = 1
			}
			lastInterruptTimestamp = now
		})
	}

	/**
	 * Add a listener to react to interrupt signals.
	 * It will be removed after firing once.
	 */
	public addListener(onInterrupt: () => void) {
		this.listeners.unshift(onInterrupt)
	}

	/**
	 * Create an AbortSignal tied to interrupt signals.
	 */
	public createAbortSignal(): AbortSignal {
		const abortController = new AbortController()
		this.addListener(() => {
			abortController.abort()
		})
		return abortController.signal
	}
}