import dateFormat from "dateformat"

/**
 * Formats a timestamp like 2024-04-22 15:50:28.00
 * @param ms timestamp
 */
export function formatTimestamp(ms: number): string {
	return dateFormat(new Date(ms), "yyyy-mm-dd HH:MM:ss.L")
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