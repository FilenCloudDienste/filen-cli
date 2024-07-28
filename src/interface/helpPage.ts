import dedent from "dedent"
import { version } from "../buildInfo"

/**
 * Provides general and specific help pages.
 */
export class HelpPage {
	/**
	 * @param topic "general" or a specific topic
	 * @return the help page for a topic
	 */
	getHelpPage(topic: string): string | undefined {
		if (topic === "general") return this.generalHelpPage
		if (topic === "fs") return this.fsHelpPage
		if (topic === "sync") return this.syncHelpPage
		if (topic === "webdav") return this.webdavHelpPage
		if (topic === "s3") return this.s3HelpPage
		return undefined
	}

	/**
	 * @return the help page shown when using the `help` command in interactive mode
	 */
	getInteractiveModeHelpPage() {
		return this.interactiveModeHelpPage
	}

	private readonly versionUrlSegment = version === "0.0.0" ? "" : `/tree/${version}`

	private readonly commands = [
		["ls [dir]", "list items inside a directory"],
		["cat <file>", "print content of a text file"],
		["mkdir <dir>", "create a directory"],
		["rm <path>", "delete a file or directory"],
		["download <cloud path> <local path>", "download a file or directory from the cloud into a local destination"],
		["upload <local file> <cloud path>", "upload a local file into the cloud at a specified path"],
		["stat <path>", "display information about a file or directory"],
		["statfs", "display information about your Filen cloud drive"],
		["whoami", "print the current user"],
		["mv <path from> <path to>", "move a file to a path (parent directory or file)"],
		["cp <path from> <path to>", "copy a file to a path (parent directory or file)"],
		["write <file> <content...>", "write text to a file"],
		["open <file>", "open a file locally in the associated application"],
		["edit <file>", "edit a file locally in the associated application (save and close to re-upload)"],
	]
	private readonly interactiveModeCommands = [
		["cd <path>", "navigate to a different path"],
		["ls", "list items inside current directory"],
		["exit, ^C", "exit interactive mode"]
	]

	private readonly interactiveModeHelpPage: string = dedent`
		Commands:
		${formatTable([...this.commands, ...this.interactiveModeCommands])}}
		`

	private readonly generalHelpPage: string = dedent`
		Usage: filen [options...]
		
		Options:
		${formatTable([
			["--help, -h", "display usage information"],
			["--verbose, -v", "display additional information"],
			["--email <email>", "specify credentials"],
			["--password <password>", ""],
			["--two-factor-code <code>, -c <code>", "(optional)"],
		])}
		
		View the topic pages via \`filen -h <topic>\` for more information:
		${formatTable([
			["fs", "Access your Filen Drive"],
			["sync", "Syncing locations with the cloud"],
			["webdav", "WebDAV mirror server with single user or proxy mode"],
			["s3", "S3 mirror server"],
		])}
		
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#readme
		`

	private readonly fsHelpPage: string = dedent`
		Usage: filen [options...] <cmd...>
		
		Additional options:
		${formatTable([
			["--quiet, -q", "hide things like progress bars"],
			["--root <path>, -r <path>", "execute a stateless command from a different working directory"],
			["--json", "format output as JSON"],
			["--no-autocomplete", "disable autocompletion (for performance or bandwidth reasons)"],
		])}
		
		Commands:
		${formatTable(this.commands)}
		
		Interactive mode:
		Invoke the Filen CLI with no command specified to enter interactive mode. 
		${formatTable(this.interactiveModeCommands)}
		
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#access-your-filen-drive
		`

	private readonly syncHelpPage: string = dedent`
		Usage: filen sync [sync pairs...] [--continuous]
		
		Examples:
		${formatTable([
			["filen sync", "read sync pairs from $APP_DATA/filen_cli/syncPairs.json of type {local: string, remote: string, syncMode: string, alias?: string}[]"],
			["filen sync <file>", "read sync pairs from custom JSON file"],
			["filen sync mypair myotherpair", "use aliases as defined in syncPairs.json"],
			["filen sync /local/path:/cloud/path", "sync a local path with a cloud path in two-way sync"],
			["filen sync /local1::/cloud1 /local2:twoWay:/cloud2", "other ways to specify two-way sync"],
			["filen sync /local1:localToCloud:/cloud1 /local2:ltc:/cloud2", "localToCloud sync (other sync modes: cloudBackup, cloudToLocal, cloudBackup)"]
	    ])}
	    
		Set the --continuous flag to keep syncing (instead of only syncing once).
	    
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#syncing 
		`

	private readonly webdavHelpPage: string = dedent`
		Usage:
		  Single user: filen webdav --w-user <...> --w-password <...> [options...]
		  Proxy mode:  filen webdav-proxy [options...]
		
		Additional options:
		${formatTable([
			["--w-https", "use HTTPS instead of HTTP (using a self-signed certificate)"],
			["--w-hostname", "which hostname the server should be started on (default is 0.0.0.0)"],
			["--w-port", "which port the server should be started on (default is 80 or 443)"],
			["--w-auth-scheme", "the authentication scheme the server should use, \"basic\" or \"digest\" (default is basic)"],
		])}
		
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#webdav-server
		`

	private readonly s3HelpPage: string = dedent`
		Usage: filen s3 --s3-access-key-id <...> --s3-secret-access-key <...> [options...]
		
		Additional options:
		${formatTable([
			["--s3-https", "use HTTPS instead of HTTP (using a self-signed certificate)"],
			["--s3-hostname", "which hostname the server should be started on (default is 0.0.0.0)"],
			["--s3-port", "which port the server should be started on (default is 80 or 443)"],
		])}
		
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#s3-server
		`
}

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
			if (cell !== undefined && cell.length > columnWidths[i]!) columnWidths[i] = cell.length
		})
	}

	const lines: string[] = []
	table.forEach(row => {
		const line: string[] = []
		for (let column = 0; column < row.length; column++) {
			line.push(row[column] + " ".repeat(columnWidths[column]! - row[column]!.length))
		}
		lines.push(line.join(" ".repeat(spacing)))
	})
	return lines.join("\n")
}