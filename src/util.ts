import crypto from "crypto"
import * as fsModule from "node:fs"

/**
 * Formats a timestamp as yyyy-MM-dd.hh.mm.ss.SSS
 * @param ms timestamp
 */
export function formatTimestamp(ms: number) {
	// see https://stackoverflow.com/a/19448513
	const pad2 = (n: number) => {
		return n < 10 ? "0" + n : n
	}
	const date = new Date(ms)
	return date.getFullYear().toString() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) + " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes()) + ":" + pad2(date.getSeconds()) + "." + pad2(date.getMilliseconds())
}

/**
 * A function that does nothing.
 */
export const doNothing = () => {
}

/**
 * Generate the md5 hash of a file
 */
export function hashFile(path: string) {
	return new Promise((resolve) => {
		// see https://stackoverflow.com/a/18658613
		const hash = crypto.createHash("md5", { encoding: "hex" })
		const stream = fsModule.createReadStream(path)
		stream.on("end", () => {
			hash.end()
			resolve(hash.read().toString())
		})
		stream.pipe(hash)
	})
}
