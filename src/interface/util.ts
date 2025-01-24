import cliProgress from "cli-progress"
import { errExit } from "./interface"

/**
 * Formats a timestamp as yyyy-MM-dd.hh.mm.ss.SSS
 * @param ms timestamp
 */
export function formatTimestamp(ms: number): string {
	// see https://stackoverflow.com/a/19448513
	const pad2 = (n: number) => {
		return n < 10 ? "0" + n : n
	}

	const padDecimals3 = (n: number) => {
		const str = n.toString()
		return str + "0".repeat(3 - str.length)
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
		padDecimals3(date.getMilliseconds())
	)
}

/**
 * Format an amount of bytes as a unit (Bytes, KiB, MiB, ...)
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
	// see https://stackoverflow.com/a/18650828
	if (!+bytes) return "0 B"
	const base = 1024
	decimals = decimals < 0 ? 0 : decimals
	const sizes = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]
	const i = Math.floor(Math.log(bytes) / Math.log(base))
	return `${parseFloat((bytes / Math.pow(base, i)).toFixed(decimals))} ${sizes[i]}`
}

/**
 * Display a progress bar for a file transfer.
 * @param action The action (like "Downloading", "Uploading")
 * @param file The file's name
 * @param total Total size of the file (in bytes)
 * @param isApproximate Whether to display an approximate symbol "~" before the current total
 */
export function displayTransferProgressBar(
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
				progressBar.update({ speed: `Avg: ${formatBytes(total / (now - startTime) / 1000)}/s` })
				progressBar.stop()
			}
		}
		return { progressBar, onProgress }
	} catch (e) {
		errExit("display a progress bar", e)
	}
}

/**
 * Formats a two-dimensional array as a table.
 * @param table An array of rows
 * @param spacing Amount of whitespaces between columns
 * @param rightAlignFirstColumn Whether to align the first column of the table to the right instead of the left.
 */
export function formatTable(table: string[][], spacing: number = 3, rightAlignFirstColumn: boolean = false): string {
	let columns = 0
	table.forEach(row => {
		if (row.length > columns) columns = row.length
	})

	const columnWidths: number[] = []
	for (let i = 0; i < columns; i++) {
		columnWidths.push(0)
		table.forEach(row => {
			const cell = row[i]
			if (cell !== undefined && cell.length > columnWidths[i]!) columnWidths[i] = cell.length
		})
	}

	const lines: string[] = []
	table.forEach(row => {
		const line: string[] = []
		for (let column = 0; column < row.length; column++) {
			if (rightAlignFirstColumn && column === 0) {
				line.push(" ".repeat(columnWidths[column]! - row[column]!.length) + row[column])
			} else {
				line.push(row[column] + " ".repeat(columnWidths[column]! - row[column]!.length))
			}
		}
		lines.push(line.join(" ".repeat(spacing)))
	})
	return lines.join("\n")
}

/**
 * Wrap text with the control characters necessary to produce red text in a terminal.
 */
export function wrapRedTerminalText(text: string): string {
	// see https://stackoverflow.com/a/41407246
	return "\x1b[31m" + text + "\x1b[0m"
}