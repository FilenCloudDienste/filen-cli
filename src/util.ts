import crypto from "crypto"
import * as fsModule from "node:fs"
import { PathLike } from "node:fs"
import path from "path"
import os from "os"

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

/**
 * Format an amount of bytes as a unit (Bytes, KiB, MiB, ...)
 */
export function formatBytes(bytes: number, decimals: number = 2) {
	// see https://stackoverflow.com/a/18650828
	if (!+bytes) return "0 Bytes"
	const base = 1024
	decimals = decimals < 0 ? 0 : decimals
	const sizes = ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]
	const i = Math.floor(Math.log(bytes) / Math.log(base))
	return `${parseFloat((bytes / Math.pow(base, i)).toFixed(decimals))} ${sizes[i]}`
}

/**
 * Check if a path exists.
 */
export async function exists(path: PathLike) {
	try {
		await fsModule.promises.stat(path)
		return true
	} catch (e) {
		return false
	}
}

/**
 * Returns the platform-specific directory for storing configuration files.
 * - Windows: `%APPDATA%`
 * - OS X: `~/Library/Application Support`
 * - Unix: `$XDG_CONFIG_HOME` or `~/.config`
 */
export function platformConfigPath() {
	// see https://github.com/jprichardson/ospath/blob/master/index.js
	switch (process.platform) {
		case "win32":
			return path.resolve(process.env.APPDATA!)
		case "darwin":
			return path.resolve(path.join(os.homedir(), "Library/Application Support/"))
		default:
			return process.env.XDG_CONFIG_HOME
				? path.resolve(process.env.XDG_CONFIG_HOME)
				: path.resolve(path.join(os.homedir(), ".config/"))
	}
}