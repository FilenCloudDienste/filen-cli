import crypto from "crypto"
import * as fsModule from "node:fs"
import { PathLike } from "node:fs"
import os from "os"
import { isDevelopment } from "../index"
import * as https from "node:https"
import pathModule from "path"
import FilenSDK, { CloudItem } from "@filen/sdk"

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

let _platformConfigPath: string | undefined = undefined
/**
 * Returns the platform-specific directory for storing configuration files.
 * Creates the directory if it doesn't exist.
 * - Windows: `%APPDATA%\filen-cli`
 * - OS X: `~/Library/Application Support/filen-cli` (or `~/.filen-cli`)
 * - Unix: `$XDG_CONFIG_HOME/filen-cli` or `~/.config/filen-cli` (or `~/.filen-cli`)
 */
export function platformConfigPath(): string {
	if (_platformConfigPath !== undefined) return _platformConfigPath

	// default config path, see https://github.com/jprichardson/ospath/blob/master/index.js
	let configPath: string = (() => {
		switch (process.platform) {
			case "win32": return pathModule.resolve(process.env.APPDATA!)
			case "darwin": return pathModule.resolve(pathModule.join(os.homedir(), "Library/Application Support/"))
			default: return process.env.XDG_CONFIG_HOME
				? pathModule.resolve(process.env.XDG_CONFIG_HOME)
				: pathModule.resolve(pathModule.join(os.homedir(), ".config/"))
		}
	})()

	// use install location of install.sh, if it exists
	if (fsModule.existsSync(pathModule.join(os.homedir(), ".filen-cli"))) {
		configPath = pathModule.resolve(pathModule.join(os.homedir(), ".filen-cli"))
	}

	if (!configPath || configPath.length === 0) {
		throw new Error("Could not find homedir path.")
	}

	if (!(configPath.includes("filen-cli"))) {
		configPath = pathModule.join(configPath, "filen-cli")
	}

	if (isDevelopment) {
		configPath = pathModule.join(configPath, "dev")
	}

	if (!fsModule.existsSync(configPath)) {
		fsModule.mkdirSync(configPath, {
			recursive: true
		})
	}

	_platformConfigPath = configPath
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
			} else if (response.statusCode === 200) {
				response.pipe(stream)
				stream.on("finish", () => {
					stream.close()
					resolve()
				})
				stream.on("error", reject)
			} else {
				reject(new Error(`HTTP response ${response.statusCode}`))
			}
		})
	})
}

/**
 * Fetch the full path for `CloudItem`s.
 */
export async function getItemPaths(filen: FilenSDK, items: CloudItem[]): Promise<(CloudItem & {path: string})[]> {
	return await Promise.all(items.map(async item => {
		const path = item.type === "file"
			? await filen.cloud().fileUUIDToPath({ uuid: item.uuid })
			: await filen.cloud().directoryUUIDToPath({ uuid: item.uuid })
		return { ...item, path }
	}))
}