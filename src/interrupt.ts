import readline from "node:readline"

/**
 * Handles SIGINT signals.
 */
export class InterruptHandler {
	public static readonly instance = new InterruptHandler()

	private listeners: (() => void)[] = []

	public constructor() {
		if (process.platform === "win32") {
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
			rl.on("SIGINT", function() {
				process.emit("SIGINT")
			})
		}
		process.on("SIGINT", () => this.interrupt())
	}

	private interrupt() {
		this.listeners.forEach((listener) => listener())
		this.listeners = []
	}

	/**
	 * Add a listener to react to interrupt signals.
	 * It will be removed after firing once.
	 */
	public addListener(onInterrupt: () => void) {
		this.listeners.push(onInterrupt)
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