export const helpPage: string = `
Usage: filen [options...] <cmd...>

Options:
${formatTable([
	["--help, -h", "display usage information"],
	["--verbose, -v", "display additional information"],
	["--email <email>", "specify credentials"],
	["--password <password>", ""],
	["--two-factor-code <code>, -c <code>", "(optional)"],
	["--quiet, -q", "hide things like progress bars"],
	["--root <path>, -r <path>", "execute a stateless command from a different working directory"],
	["--json", "format output as JSON"],
	["--no-autocomplete", "disable autocompletion (for performance or bandwidth reasons)"],
])}

Commands:
${formatTable([
	["ls [dir]", "list items inside a directory"],
	["cat <file>", "print content of a text file"],
	["mkdir <dir>", "create a directory"],
	["rm <path>", "delete a file or directory"],
	["download <cloud path> <local path>", "download a file or directory from the cloud into a local destination"],
	["upload <local file> <cloud path>", "upload a local file into the cloud at a specified path"],
	["stat <path>", "display information about a file or directory"],
	["statfs", "display information about your Filen cloud drive"],
	["mv <path from> <path to>", "move a file to a path (parent directory or file)"],
	["cp <path from> <path to>", "copy a file to a path (parent directory or file)"],
	["write <file> <content...>", "write text to a file"],
	["open <file>", "open a file locally in the associated application"],
	["edit <file>", "edit a file locally in the associated application (save and close to re-upload)"],
])}

Interactive mode:
Invoke the Filen CLI without any specified commands to enter interactive mode. 
${formatTable([
	["cd <path>", "navigate to a different path"],
	["ls", "list items inside current directory"],
	["exit, ^C", "exit interactive mode"]
])}

Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli#readme
`

/**
 * Formats a two-dimensional array as a table.
 * @param table An array of rows
 * @param spacing Amount of whitespaces between columns
 */
function formatTable(table: string[][], spacing: number = 3): string {
	let columns = 0
	table.forEach(row => {
		if (row.length > columns) columns = row.length
	})

	const columnWidths: number[] = []
	for (let i = 0; i < columns; i++) {
		columnWidths.push(0)
		table.forEach(row => {
			const cell = row[i]
			if (cell.length > columnWidths[i]) columnWidths[i] = cell.length
		})
	}

	const lines: string[] = []
	table.forEach(row => {
		const line: string[] = []
		for (let column = 0; column < row.length; column++) {
			line.push(row[column] + " ".repeat(columnWidths[column] - row[column].length))
		}
		lines.push(line.join(" ".repeat(spacing)))
	})
	return lines.join("\n")
}