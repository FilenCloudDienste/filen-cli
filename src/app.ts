import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import * as fs from "node:fs"
import { Authentication } from "./auth"
import { isRunningAsContainer, isRunningAsNPMPackage, version } from "./buildInfo"
import { Updater } from "./updater"
import { HelpPage } from "./interface/helpPage"
import { FSInterface, fsOptions } from "./featureInterfaces/fs/fsInterface"
import { WebDAVInterface, webdavOptions } from "./featureInterfaces/webdavInterface"
import { S3Interface, s3Options } from "./featureInterfaces/s3Interface"
import { SyncInterface, syncOptions } from "./featureInterfaces/syncInterface"
import { TrashInterface } from "./featureInterfaces/trashInterface"
import { PublicLinksInterface } from "./featureInterfaces/publicLinksInterface"
import { DriveMountingInterface } from "./featureInterfaces/driveMountingInterface"
import { ANONYMOUS_SDK_CONFIG } from "./constants"
import { determineDataDir } from "./util/util"
import { ExportNotesInterface } from "./featureInterfaces/exportNotesInterface"
import { Mutex } from "async-mutex"
import * as buffer from "buffer"
import { randomUUID } from "node:crypto"
import { formatTimestamp } from "./interface/util"
import { Autocompletion } from "./featureInterfaces/fs/autocompletion"

/**
 * App manages application-wide configuration and console I/O. 
 */
export class App {
	private readonly args

	/**
	 * Whether the application is run in a development environment (set via the `--dev` flag).
	 */
	public readonly isDevelopment 

	/**
	 * The directory where data files (configuration files, cache, credentials etc.) are stored.
	 */
	public readonly dataDir

	/**
	 * the --quiet flag
	 */
	public readonly quiet

	/**
	 * the --verbose flag
	 */
	public readonly verbose

	constructor(argv: string[], private adapter: InterfaceAdapter) {
		// parse arguments
		this.args = arg(
			{
				"--dev": Boolean,
		
				"--help": Boolean,
				"-h": "--help",
				"--version": Boolean,
		
				"--verbose": Boolean,
				"-v": "--verbose",
		
				"--quiet": Boolean,
				"-q": "--quiet",
		
				"--email": String,
				"-e": "--email",
		
				"--password": String,
				"-p": "--password",
		
				"--two-factor-code": String,
				"-c": "--two-factor-code",
		
				"--log-file": String,
				"--data-dir": String,
		
				"--skip-update": Boolean,
				"--force-update": Boolean,
				"--auto-update": Boolean,
		
				...fsOptions,
				...webdavOptions,
				...s3Options,
				...syncOptions
			},
			{ permissive: true, argv }
		)

		// set flags
		this.isDevelopment = this.args["--dev"] ?? false
		this.dataDir = determineDataDir(this, this.args["--data-dir"])
		this.quiet = this.args["--quiet"] ?? false
		this.verbose = this.args["--verbose"] ?? false
		this.setupLogs(this.args["--log-file"])
	}

	// logs

	private writeLogsToDisk: () => void = () => {}

	private setupLogs(logsFile: string | undefined = undefined) {
		if (logsFile === undefined) return
		this.writeLogsToDisk = () => {
			try {
				if (fs.readFileSync(logsFile).length > 1) this.logs = "\n\n" + this.logs
			} catch {
				// do nothing
			}
			fs.appendFileSync(logsFile, this.logs)
		}
		process.on("exit", () => this.writeLogsToDisk!())
		this.writeLog(`> ${process.argv.join(" ")}`, "log")
	}

	private logs = ""
	private logsMutex = new Mutex()
	private writeLog(message: string, type: "log" | "input" | "error") {
		this.logsMutex.acquire().then(() => {
			this.logs += message.split("\n").map(line => `${formatTimestamp(new Date().getTime())} ${type === "log" ? "[LOG]" : type === "error" ? "[ERR]" : "[IN ]"} ${line}\n`).join("")
			if (buffer.constants.MAX_STRING_LENGTH - this.logs.length < 10_000) {
				// the in-memory log file is too large, flush it to disk
				const randomTag = randomUUID()
				this.logs += `                              (these logs are continued at #${randomTag})\n`
				this.writeLogsToDisk?.()
				this.logs = `                              (this is the continuation of #${randomTag})\n`
			}
			this.logsMutex.release()
		})
	}

	// output

	/**
	 * Global output method
	 * @param message
	 */
	public out(message: string) {
		this.adapter.out(message)
		this.writeLog(message, "log")
	}

	/**
	 * Shorthand for `if (!app.quiet) app.out(message)`
	 */
	public outUnlessQuiet(message: string) {
		if (!this.quiet) this.out(message)
	}

	/**
	 * Global output method, only prints if `--verbose` flag is set
	 */
	public outVerbose(message: string) {
		if (this.verbose) this.adapter.out(message)
		this.writeLog(message, "log")
	}

	/**
	 * Global output method for JSON
	 */
	public outJson(json: unknown) {
		this.adapter.outJson(json)
		this.writeLog(JSON.stringify(json), "log")
	}

	public thereHasBeenErrorOutput = false
	public resetThereHasBeenErrorOutput() {
		this.thereHasBeenErrorOutput = false
	}

	/**
	 * Global error output method. Outputs an error without throwing it.
	 * @see errExit
	 */
	public outErr(messageOrAction: string, underlyingError?: unknown, additionalMessage?: string) {
		this.thereHasBeenErrorOutput = true
		try {
			this.errExit(messageOrAction, underlyingError, additionalMessage)
		} catch (e) {
			this.handleExitError(e)
		}
	}

	/**
	 * Throws a user-facing error.
	 * @param messageOrAction A simple message to display (e.g. "No such file"), or the failed action, when used together with `underlyingError (e.g. "authenticate").
	 * @param underlyingError Optionally, the underlying error that was thrown.
	 * @param additionalMessage Optionally, an additional message to display: "Error trying to {action}: {e}. ({additionalMessage})"
	 * @see outErr
	 */
	public errExit(messageOrAction: string, underlyingError?: unknown, additionalMessage?: string): never {
		if (underlyingError instanceof ExitError) throw underlyingError

		let message = ""
		if (underlyingError === undefined) {
			message += messageOrAction
		} else {
			const errorStr = underlyingError instanceof Error && underlyingError.name === "Error" ? underlyingError.message : String(underlyingError)
			message += `Error trying to ${messageOrAction}: ${errorStr}`
		}
		if (additionalMessage !== undefined) {
			message += `. (${additionalMessage})`
		}

		throw new ExitError(message, { cause: underlyingError })
	}

	private handleExitError(e: unknown) {
		if (e instanceof ExitError) {
			this.adapter.errOut(e.message)
			if (e.cause) this.adapter.err(e.cause)
			this.writeLog(e.message, "error")
			if (e.cause !== undefined) this.writeLog((e.cause instanceof Error ? e.cause.stack : undefined) ?? String(e.cause), "error")
		} else {
			if (e instanceof Error) {
				this.adapter.err(e)
				this.writeLog(e.message, "error")
				if (e.stack !== undefined) this.writeLog(e.stack, "error")
			} else {
				this.adapter.err(e)
				this.writeLog("Unexpected error: " + e, "error")
			}
		}
	}

	// input
	
	private readlineHistory: string[] = []

	/**
	 * Global input prompting method
	 * @param message The message to print before the prompt
	 * @param options Options:
	 * @param options.allowExit Whether to allow to exit the application here via `^C`
	 * @param options.obfuscate Whether to obfuscate the input (for password input)
	 * @param options.useHistory Whether to read from and append to the history
	 */
	public async prompt(message: string, options: { allowExit?: boolean, obfuscate?: boolean, useHistory?: boolean } = {}) {
		return new Promise<string>((resolve) => {
			try {
				this.adapter.prompt(message, options.obfuscate ?? false, options.useHistory ? this.readlineHistory : undefined, options.allowExit ?? false, Autocompletion.instance)
					.then(input => {
						this.writeLog(message, "log")
						this.writeLog(" ".repeat(message.length) + (options.obfuscate ? "***" : input), "input")
						resolve(input)
					})
					.catch(e => {
						throw e
					})
			} catch (e) {
				this.errExit("prompt for user input", e, "maybe you're in an environment without stdin, like a Docker container")
			}
		})
	}

	/**
	 * Global confirmation prompting method
	 * @param action The action to include in the prompt (e.g. "delete file.txt"), or undefined for a generic prompt.
	 * @param allowExit Whether to allow to exit the application here via `^C`
	 */
	public async promptConfirm(action: string | undefined, options: { allowExit?: boolean } = { allowExit: false }) {
		return this.promptYesNo(action !== undefined ? `Are you sure you want to ${action}?` : "Are you sure?", options)
	}

	/**
	 * Global confirmation prompting method
	 * @param question The question to include in the prompt
	 * @param defaultAnswer The default answer if there's no input
	 * @param allowExit Whether to allow to exit the application here via `^C`
	 */
	public async promptYesNo(question: string, options: { defaultAnswer?: boolean, allowExit?: boolean } = { defaultAnswer: false, allowExit: false }) {
		return new Promise<boolean>((resolve) => {
			this.prompt(`${question} ${options.defaultAnswer ? "[Y/n]" : "[y/N]"} `, options).then(result => {
				const input = result.toLowerCase()
				if (input === "n" || input === "no") {
					resolve(false)
				} else if (input === "y" || input === "yes") {
					resolve(true)
				} else if (input.trim() === "") {
					resolve(options.defaultAnswer ?? false)
				} else {
					this.outErr("Invalid input, please enter 'y' or 'n'!")
					this.promptYesNo(question, options).then(resolve)
				}
			})
		})
	}

	// interrupts
	
	/**
	 * Add a listener to react to interrupt signals.
	 * It will be removed after firing once.
	 */
	public addInterruptListener(onInterrupt: () => void) {
		this.adapter.addInterruptListener(onInterrupt)
	}

	/**
	 * Create an AbortSignal tied to interrupt signals.
	 */
	public createAbortSignal(): AbortSignal {
		const abortController = new AbortController()
		this.addInterruptListener(() => {
			abortController.abort()
		})
		return abortController.signal
	}

	// main

	/**
	 * Main entry point for the application.
	 * @returns an exit status (true for ok, false for error)
	 */
	public async main() {
		let status = true
		try {
			await this._main()
		} catch (e) {
			if (e !== exitCode1Error) this.handleExitError(e)
			status = false
		}
		this.writeLogsToDisk()
		return status
	}
	private async _main() {

		// --version: print version and exit
		if ((this.args["--version"] ?? false) || this.args["_"][0] === "version") {
			this.out(version)
			return
		}
	
		// print version
		if (this.args["--help"]) this.out(`Filen CLI ${version}`)
		else this.outVerbose(`Filen CLI ${version}`)
	
		// print info about environment
		let environment = "Environment: "
		environment += `data-dir=${this.dataDir}`
		if (isRunningAsContainer) environment += ", in container"
		if (isRunningAsNPMPackage) environment += ", as NPM package"
		if (this.isDevelopment) environment += ", development"
		this.outVerbose(environment)
	
		// --help: print help and exit
		if ((this.args["--help"] ?? false) || this.args["_"][0] === "help") {
			const topic = (this.args["_"][0] === "help" ? this.args["_"][1] : this.args["_"][0])?.toLowerCase() ?? "general"
			const helpPage = new HelpPage().getHelpPage(topic)
			if (helpPage !== undefined) {
				this.out("\n" + helpPage)
			} else {
				this.errExit(`Unknown help page ${topic}`)
			}
			return
		}
	
		// check for updates
		if (this.args["--skip-update"] !== true) {
			const updater = new Updater(this)
			if (this.args["_"][0] === "canary") {
				try {
					await updater.showCanaryPrompt()
					return
				} catch (e) {
					this.errExit("change canary preferences", e)
				}
			}
			if (this.args["_"][0] === "install") {
				try {
					const version = this.args["_"][1]
					if (version === undefined) this.errExit("Need to specify version")
					await updater.fetchAndInstallVersion(version!)
					return
				} catch (e) {
					this.errExit("install version", e)
				}
			}
			try {
				await updater.checkForUpdates(this.args["--force-update"] ?? false, this.args["--auto-update"] ?? false)
			} catch (e) {
				this.errExit("check for updates", e)
			}
		} else {
			this.outVerbose("Update check skipped")
		}
	
		const filen = new FilenSDK({
			...ANONYMOUS_SDK_CONFIG,
			connectToSocket: true, // Needed to keep internal SDK FS tree up to date with remote changes
			metadataCache: true,
			tmpPath: path.join(os.tmpdir(), "filen-cli")
		})
	
		// authentication
		if (this.args["_"][0] !== "webdav-proxy") {
			// skip authentication for webdav proxy mode
			const authentication = new Authentication(this, filen)
			try {
				if (this.args["_"][0] === "logout") {
					await authentication.deleteSavedCredentials()
					return
				}
			} catch (e) {
				this.outErr("delete credentials", e)
			}
			try {
				const { exit } = await authentication.authenticate(
					this.args["--email"],
					this.args["--password"],
					this.args["--two-factor-code"],
					this.args["_"][0] === "export-auth-config",
					this.args["_"][0] === "export-api-key",
				)
				if (exit) return
			} catch (e) {
				this.errExit("authenticate", e)
			}
		}
	
		if (this.args["_"][0] === "webdav" || this.args["_"][0] === "webdav-proxy") {
			// webdav
			const webdavInterface = new WebDAVInterface(this, filen)
			const proxyMode = this.args["_"][0] === "webdav-proxy"
			try {
				await webdavInterface.invoke(proxyMode, {
					username: this.args["--w-user"],
					password: this.args["--w-password"],
					https: this.args["--w-https"] ?? false,
					hostname: this.args["--w-hostname"],
					port: this.args["--w-port"],
					authScheme: this.args["--w-auth-scheme"],
					threads: this.args["--w-threads"]
				})
			} catch (e) {
				this.errExit("start WebDAV server", e)
			}
		} else if (this.args["_"][0] === "s3") {
			// s3
			const s3Interface = new S3Interface(this, filen)
			try {
				await s3Interface.invoke({
					hostname: this.args["--s3-hostname"],
					port: this.args["--s3-port"],
					https: this.args["--s3-https"] ?? false,
					accessKeyId: this.args["--s3-access-key-id"],
					secretAccessKey: this.args["--s3-secret-access-key"],
					threads: this.args["--s3-threads"]
				})
			} catch (e) {
				this.errExit("start S3 server", e)
			}
		} else if (this.args["_"][0] === "sync") {
			// sync
			const syncInterface = new SyncInterface(this, filen)
			try {
				await syncInterface.invoke(this.args["_"].slice(1), this.args["--continuous"] ?? false, this.args["--disable-local-trash"] ?? false)
			} catch (e) {
				this.errExit("invoke sync", e)
			}
		} else if (this.args["_"][0] === "trash") {
			// trash
			const trashInterface = new TrashInterface(this, filen)
			try {
				await trashInterface.invoke(this.args["_"].slice(1))
			} catch (e) {
				this.errExit("execute trash command", e)
			}
		} else if (this.args["_"][0] === "links" || this.args["_"][0] === "link") {
			// links
			const publicLinksInterface = new PublicLinksInterface(this, filen)
			await publicLinksInterface.invoke(this.args["_"].slice(1))
		} else if (this.args["_"][0] === "mount") {
			// mount
			const driveMountingInterface = new DriveMountingInterface(this, filen)
			try {
				await driveMountingInterface.invoke(this.args["_"][1])
			} catch (e) {
				this.errExit("execute mount command", e)
			}
		} else if (this.args["_"][0] === "export-notes") {
			// export notes
			const exportNotesInterface = new ExportNotesInterface(this, filen)
			try {
				await exportNotesInterface.invoke(this.args["_"].slice(1))
			} catch (e) {
				this.errExit("export notes", e)
			}
		} else {
			// fs commands
			const fsInterface = new FSInterface(this, filen)
			const { exitWithError } = await fsInterface.invoke({
				formatJson: this.args["--json"]!,
				root: this.args["--root"],
				noAutocomplete: this.args["--no-autocomplete"] ?? false,
				commandStr: this.args["_"]
			})
			if (exitWithError) throw exitCode1Error
		}
	}
}

export interface InterfaceAdapter {
	out(message: string): void
	outJson(json: unknown): void
	errOut(message: string): void
	err(error: unknown): void
	prompt(message: string, obfuscate: boolean, history: string[] | undefined, allowExit: boolean, autocompletion: Autocompletion | null): Promise<string>
	addInterruptListener(listener: () => void): void
}

export class ExitError extends Error {}

// throw this when no addition error should be printed, but exit code 1 should be returned
const exitCode1Error = new ExitError("Exit code 1")