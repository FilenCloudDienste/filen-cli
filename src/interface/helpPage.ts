import dedent from "dedent"
import { version } from "../buildInfo"
import { formatTable } from "./util"

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
		if (topic === "auth") return this.authHelpPage
		if (topic === "fs") return this.fsHelpPage
		if (topic === "sync") return this.syncHelpPage
		if (topic === "webdav") return this.webdavHelpPage
		if (topic === "s3") return this.s3HelpPage
		if (topic === "mount") return this.driveMountingHelpPage
		if (topic === "libsecret") return this.libsecretHelpPage
		if (topic.startsWith("update")) return this.updatesHelpPage
		return undefined
	}

	/**
	 * @return the help page shown when using the `help` command in interactive mode
	 */
	getInteractiveModeHelpPage() {
		return this.interactiveModeHelpPage
	}

	private readonly versionUrlSegment = version === "0.0.0" ? "" : `/tree/${version}`

	private readonly unixStyleCommands = [
		["ls [dir]", "list items inside a directory (`-l` for more detailed output)"],
		["cat <file>", "print content of a text file"],
		["head <file> / tail <file>", "print first/last 10 lines of a text file (pass `-n <n>` to print n lines)"],
		["mkdir <dir>", "create a directory"],
		["rm <path>", "delete a file or directory (`--no-trash` to delete permanently)"],
		["stat <path>", "display information about a file or directory"],
		["statfs", "display information about your Filen cloud drive"],
		["whoami", "print the current user"],
		["mv <path from> <path to>", "move a file to a path (parent directory or file)"],
		["cp <path from> <path to>", "copy a file to a path (parent directory or file)"],
	]
	private readonly nonStandardCommands = [
		["download <cloud path> <local path>", "download a file or directory from the cloud into a local destination"],
		["upload <local file> <cloud path>", "upload a local file into the cloud at a specified path"],
		["write <file> <content...>", "write text to a file"],
		["open <file>", "open a file locally in the associated application"],
		["edit <file>", "edit a file locally in the associated application (save and close to re-upload)"],
		["view <path>", "view a directory in the Web Drive"],
		["favorites", "list favorites"],
		["favorite <path>", "favorite a file or directory"],
		["unfavorite <path>", "unfavorite a file or directory"],
		["recents", "list recents"],
	]
	private readonly interactiveModeCommands = [
		["help", "display this help page"],
		["cd <path>", "navigate to a different path"],
		["ls", "list items inside current directory"],
		["exit, ^C", "exit interactive mode"]
	]

	private readonly interactiveModeHelpPage: string = dedent`
		${formatTable(this.unixStyleCommands)}
		
		${formatTable(this.nonStandardCommands)}
		
		${formatTable(this.interactiveModeCommands)}
		`

	private readonly generalHelpPage: string = dedent`
		Usage: filen [options...]
		
		Options:
		${formatTable([
			["--help, -h", "display usage information"],
			["--verbose, -v", "display additional information"],
			["--quiet, -q", "hide things like progress bars and additional logs"],
			["--email <email>", "specify credentials"],
			["--password <password>", ""],
			["--two-factor-code <code>, -c <code>", "(optional)"],
			["--log-file <file>", "write logs to a file"],
		])}
		
		View the topic pages via \`filen -h <topic>\` for more information:
		${formatTable([
			["fs", "Access your Filen Drive"],
			["auth", "How to authenticate your Filen account"],
			["sync", "Syncing locations with the cloud"],
			["mount", "Mount a network drive"],
			["webdav", "WebDAV mirror server with single user or proxy mode"],
			["s3", "S3 mirror server"],
			["updates", "Fetching and installing updates"],
		])}
		
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#readme
		`

	private readonly authHelpPage: string = dedent`
		Ways to authenticate:
		1) Invoke the CLI and specify your Filen email and password when prompted. Optionally, save your credentials.
		2) Pass the --email and --password (optionally --two-factor-code) arguments.
		3) Put your credentials in the FILE_EMAIL and FILEN_PASSWORD (optionally FILEN_2FA_CODE) environment variables.
		4) Store your Filen email and password in a file named .filen-cli-credentials with email and password (optionally 2FA code) in separate plaintext lines.
		5) Export an "auth config" using \`filen export-auth-config\` and place it where you invoke the CLI. (See the full documentation for more details.)
		
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#authenticating
	`

	private readonly fsHelpPage: string = dedent`
		Usage: filen [options...] <cmd...>
		
		Additional options:
		${formatTable([
			["--root <path>, -r <path>", "execute a stateless command from a different working directory"],
			["--json", "format output as JSON"],
			["--no-autocomplete", "disable autocompletion (for performance or bandwidth reasons)"],
		])}
		
		Commands:
		
		${formatTable(this.unixStyleCommands)}
		
		${formatTable(this.nonStandardCommands)}
		
		Interactive mode:
		Invoke the Filen CLI with no command specified to enter interactive mode. 
		${formatTable(this.interactiveModeCommands)}
		
		Trash:
		${formatTable([
			["filen trash", "list trash items"],
			["filen trash restore", "restore a trash item"],
			["filen trash delete", "permanently delete a trash item"],
			["filen trash empty", "permanently delete all trash items"]
	    ])}
		
		Public Links:
		${formatTable([
			["filen links", "view all public links"],
			["filen links <path>", "create, view, edit or delete a public link for the given path"]
	    ])}
		
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#access-your-filen-drive
		`

	private readonly syncHelpPage: string = dedent`
		Usage: filen sync [sync pairs...] [--continuous]
		
		Examples:
		${formatTable([
			["filen sync", "read sync pairs from $APP_DATA/filen_cli/syncPairs.json of type {local: string, remote: string, syncMode: string, alias?: string, disableLocalTrash?: boolean, ignore?: string[], excludeDotFiles?: boolean}[]"],
			["filen sync <file>", "read sync pairs from custom JSON file"],
			["filen sync mypair myotherpair", "use aliases as defined in syncPairs.json"],
			["filen sync /local/path:/cloud/path", "sync a local path with a cloud path in two-way sync"],
			["filen sync /local1:twoWay:/cloud1", "other way to specify two-way sync"],
			["filen sync /local1:localToCloud:/cloud1 /local2:ltc:/cloud2", "local-to-cloud sync (other sync modes: `cloudBackup`, `cloudToLocal`, `cloudBackup`, all with similar abbreviations)"],
			["filen sync /local:/cloud --disable-local-trash", "disable local trash"]
	    ])}
	    
		Set the --continuous flag to keep syncing (instead of only syncing once).
	    
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#syncing 
		`

	private readonly driveMountingHelpPage: string = dedent`
		Usage: filen mount [mount point]
		
		The default mount point is "X:" or "/tmp/filen".
		
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#network-drive-mounting
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
			["--w-threads", "enables clustering, number of threads to use for the server (default is no clustering; explicitly set to 0 to set by CPU core count)"],
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
			["--s3-threads", "enables clustering, number of threads to use for the server (default is no clustering; explicitly set to 0 to set by CPU core count)"],
		])}
		
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#s3-server
		`

	private readonly libsecretHelpPage: string = dedent`
		On Linux, the Filen CLI uses libsecret to store the credentials crypto key in the system Secret Service.
		
		If you experience issues with saving credentials, you can try installing libsecret via:
			Debain/Ubuntu:  sudo apt-get install libsecret-1-dev
			Red Hat based:  sudo yum install libsecret-devel
			Arch:           sudo pacman -S libsecret
		
		Alternatively, you can export an auth config containing your credentials using \`filen export-auth-config\`.
		Exporting this file to $APPDATA/filen-cli will make it visible to the CLI.
		`

	private readonly updatesHelpPage: string = dedent`
		The automatic updater checks for new releases every time the CLI is invoked.
		
		After checking for updates, it will not check again for the next 10 minutes. Use the flags:
		    --force-update  to check for updates even if it was recently checked.
		    --skip-update   to skip checking for updates.
		    --auto-update   to skip the confirmation prompt and update automatically (will still abort after updating).
		
		You can always install any version using \`filen install <version>\`, \`filen install latest\` or \`filen install canary\`.
		
		If you want to be among the first to try out new features and fixes, you can enable canary releases,
		which are early releases meant for a subset of users to test before they are declared as stable.
		To enable or disable canary releases, invoke the CLI with the command \`filen canary\`.
		
		Read the full documentation at: https://github.com/FilenCloudDienste/filen-cli${this.versionUrlSegment}#installation-and-updates
		`
}