import crypto from "crypto"
import * as fsModule from "node:fs"
import { PathLike } from "node:fs"
import os from "os"
import { isDevelopment } from "./index"
import * as https from "node:https"
import pathModule from "path"

/**
 * Formats a timestamp as yyyy-MM-dd.hh.mm.ss.SSS
 * @param ms timestamp
 */
export function formatTimestamp(ms: number): string {
	// see https://stackoverflow.com/a/19448513
	const pad2 = (n: number) => {
		return n < 10 ? "0" + n : n
	}

	const date = new Date(ms)

	return (
		date.getFullYear().toString() +
		"-" +
		pad2(date.getMonth() + 1) +
		"-" +
		pad2(date.getDate()) +
		" " +
		pad2(date.getHours()) +
		":" +
		pad2(date.getMinutes()) +
		":" +
		pad2(date.getSeconds()) +
		"." +
		pad2(date.getMilliseconds())
	)
}

/**
 * A function that does nothing.
 */
export const doNothing = (): void => {}

/**
 * Generate the md5 hash of a file
 */
export function hashFile(path: string): Promise<string> {
	return new Promise((resolve, reject) => {
		// see https://stackoverflow.com/a/18658613
		const hash = crypto.createHash("md5", { encoding: "hex" })
		const stream = fsModule.createReadStream(path)
		stream.on("error", reject)
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
export function formatBytes(bytes: number, decimals: number = 2): string {
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
export async function exists(path: PathLike): Promise<boolean> {
	try {
		await fsModule.promises.stat(path)
		return true
	} catch (e) {
		return false
	}
}

/**
 * Determine the accumulated size of all files inside a directory.
 */
export async function directorySize(path: PathLike) {
	// see https://stackoverflow.com/a/69418940/13164753
	const files = await fsModule.promises.readdir(path, {
		recursive: true,
		encoding: "utf-8"
	})
	const stats = files.map(file => fsModule.promises.stat(pathModule.join(path.toString(), file)))
	return (await Promise.all(stats)).reduce((accumulator, { size }) => accumulator + size, 0)
}

/**
 * Returns the platform-specific directory for storing configuration files.
 * Creates the directory if it doesn't exist.
 * - Windows: `%APPDATA%\filen-cli`
 * - OS X: `~/Library/Application Support/filen-cli`
 * - Unix: `$XDG_CONFIG_HOME/filen-cli` or `~/.config/filen-cli`
 */
export function platformConfigPath(): string {
	// see https://github.com/jprichardson/ospath/blob/master/index.js

	let configPath = ""

	switch (process.platform) {
		case "win32":
			configPath = pathModule.resolve(process.env.APPDATA!)
			break
		case "darwin":
			configPath = pathModule.resolve(pathModule.join(os.homedir(), "Library/Application Support/"))
			break
		default:
			configPath = process.env.XDG_CONFIG_HOME
				? pathModule.resolve(process.env.XDG_CONFIG_HOME)
				: pathModule.resolve(pathModule.join(os.homedir(), ".config/"))
			break
	}

	if (!configPath || configPath.length === 0) {
		throw new Error("Could not find homedir path.")
	}

	configPath = !isDevelopment ? pathModule.join(configPath, "filen-cli") : pathModule.join(configPath, "filen-cli", "dev")

	if (!fsModule.existsSync(configPath)) {
		fsModule.mkdirSync(configPath, {
			recursive: true
		})
	}

	return configPath
}

/**
 * Downloads a file.
 * @param url Where to download the file from.
 * @param file Where to download the file to.
 */
export function downloadFile(url: string, file: PathLike) {
	return new Promise<void>((resolve, reject) => {
		const stream = fsModule.createWriteStream(file)
		https.get(url, function (response) {
			if (response.statusCode === 302) {
				downloadFile(response.headers.location!, file).then(() => resolve())
			} else {
				response.pipe(stream)
				stream.on("finish", () => {
					stream.close()
					resolve()
				})
				stream.on("error", reject)
			}
		})
	})
}
