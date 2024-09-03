export interface ISemaphore {
	acquire(): Promise<void>
	release(): void
	count(): number
	setMax(newMax: number): void
	purge(): number
}

export const Semaphore = function (this: ISemaphore, max: number) {
	let counter = 0
	let waiting: { resolve: (value: void | PromiseLike<void>) => void; err: (reason?: unknown) => void }[] = []
	let maxCount = max || 1

	const take = function (): void {
		if (waiting.length > 0 && counter < maxCount) {
			counter++

			const promise = waiting.shift()

			if (!promise) {
				return
			}

			promise.resolve()
		}
	}

	this.acquire = function (): Promise<void> {
		if (counter < maxCount) {
			counter++

			return new Promise<void>(resolve => {
				resolve()
			})
		} else {
			return new Promise<void>((resolve, err) => {
				waiting.push({
					resolve: resolve,
					err: err
				})
			})
		}
	}

	this.release = function (): void {
		if (counter <= 0) {
			return
		}

		counter--

		take()
	}

	this.count = function (): number {
		return counter
	}

	this.setMax = function (newMax: number): void {
		maxCount = newMax
	}

	this.purge = function (): number {
		const unresolved = waiting.length

		for (let i = 0; i < unresolved; i++) {
			const w = waiting[i]

			if (w) {
				w.err("Task has been purged")
			}
		}

		counter = 0
		waiting = []

		return unresolved
	}
} as unknown as { new (max: number): ISemaphore }
