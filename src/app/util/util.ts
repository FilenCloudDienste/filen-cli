import crypto from "crypto"
import * as fsModule from "node:fs"
import { PathLike } from "node:fs"
import * as https from "node:https"
import pathModule from "path"
import cliProgress from "cli-progress"
import FilenSDK, { CloudItem } from "@filen/sdk"
import { App } from "../../framework/app"
import { X } from "../app"
import { formatBytes } from "../../framework/util"

/**
 * Display a progress bar for a file transfer.
 * @param action The action (like "Downloading", "Uploading")
 * @param file The file's name
 * @param total Total size of the file (in bytes)
 * @param isApproximate Whether to display an approximate symbol "~" before the current total
 */
export function displayTransferProgressBar(
	app: App<X>,
	action: string,
	file: string,
	total: number,
	isApproximate: boolean = false
): {
	progressBar: cliProgress.SingleBar
	onProgress: (transferred: number) => void
} {
	try {
		const progressBar = new cliProgress.SingleBar(
			{
				format: `${action} ${file} [{bar}] {percentage}% | {speed} | ETA: {eta_formatted} | ${isApproximate ? "~ " : ""}{value} / {total}`,
				// if a number is <= 100, it is likely a percentage; otherwise format as byte (library used here doesn't provide other options)
				formatValue: n => (n <= 100 ? n.toString() : formatBytes(n))
			},
			cliProgress.Presets.legacy
		)
		progressBar.start(total, 0, { speed: "N/A" })

		const startTime = Date.now()
		let speedLastUpdated = startTime
		let accumulatedTransferred = 0
		let currentSpeed = 0

		const onProgress = (transferred: number) => {
			const now = Date.now()
			accumulatedTransferred += transferred
			const elapsedSinceLastUpdate = now - speedLastUpdated
			if (elapsedSinceLastUpdate >= 1000) {
				// update speed if at least 1 second has passed
				currentSpeed = Math.round(accumulatedTransferred / (elapsedSinceLastUpdate / 1000))
				speedLastUpdated = Date.now()
				accumulatedTransferred = 0
			}
			progressBar.increment(transferred, {
				speed: `${formatBytes(currentSpeed)}/s`
			})

			if (progressBar.getProgress() >= 1.0) {
				progressBar.update({ speed: `Avg: ${formatBytes(total / (now - startTime) / 1000)}/s | ${((now - startTime) / 1000).toFixed(1)}s` })
				progressBar.stop()
			}
		}
		return { progressBar, onProgress }
	} catch (e) {
		app.errExit("display a progress bar", e)
	}
}

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
	} catch {
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

/**
 * Sanitize a string to make it a valid file name.
 */
export function sanitizeFileName(fileName: string): string {
	return fileName.replace(/[<>:"/\\|?*]/g, "_")
}