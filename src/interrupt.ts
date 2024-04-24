import { readlineInterface } from "./interface"

/**
 * Handles SIGINT signals.
 */
export class InterruptHandler {
	public static readonly instance = new InterruptHandler()

	private listeners: (() => void)[] = []

	public constructor() {
		if (process.platform === "win32") {
			readlineInterface.on("SIGINT", function() {
				process.emit("SIGINT")
			})
		}
		process.on("SIGINT", () => this.interrupt())
	}

	private interrupt() {
		if (this.listeners.length > 0) this.listeners[0]()
		this.listeners = []
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