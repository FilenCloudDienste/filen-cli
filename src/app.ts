import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import * as fs from "node:fs"
import { Authentication, authHelpText } from "./auth"
import { isRunningAsContainer, isRunningAsNPMPackage, version } from "./buildInfo"
import { updateHelpText, Updater } from "./updater"
import { generalHelpText, helpCommand, helpText, versionCommand } from "./interface/helpPage"
import { fsCommands } from "./featureInterfaces/fs/fs"
import { ANONYMOUS_SDK_CONFIG } from "./constants"
import { determineDataDir } from "./util/util"
import { Mutex } from "async-mutex"
import * as buffer from "buffer"
import { randomUUID } from "node:crypto"
import { formatTimestamp } from "./interface/util"
import { Autocompletion } from "./featureInterfaces/fs/autocompletion"
import { CloudPath } from "./util/cloudPath"
import { Feature, FeatureContext, FeatureRegistry, splitCommandSegments } from "./features"
import { driveMountingCommand } from "./featureInterfaces/driveMountingInterface"
import { webdavCommandGroup } from "./featureInterfaces/webdavInterface"
import { s3Command } from "./featureInterfaces/s3Interface"
import { syncCommand } from "./featureInterfaces/syncInterface"

export const cliArgsSpec = {
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

	"--root": String,
	"-r": "--root",
	"--json": Boolean,
	"--no-autocomplete": Boolean,
}

/**
 * App manages application-wide configuration and console I/O. 
 */
export class App {
	/**
	 * Whether the application is run in a development environment (set via the `--dev` flag).
	 */
	public readonly isDevelopment 

	/**
	 * The directory where data files (configuration files, cache, credentials etc.) are stored.
	 */
	public readonly dataDir

	public readonly features = new FeatureRegistry({ features: [
		{ features: [versionCommand, helpCommand], visibility: "hide" },
		helpText({ name: "general", text: generalHelpText }),
		...authHelpText,
		{ ...updateHelpText, visibility: "collapse" },
		helpText({ name: undefined, text: "List of commands:" }),
		{ ...fsCommands, visibility: "collapse" },
		{ title: "Syncing", features: [syncCommand], visibility: "collapse" },
		{ title: "Network drive mounting", features: [driveMountingCommand], visibility: "collapse" },
		{ ...webdavCommandGroup, visibility: "collapse" },
		{ title: "S3 server", features: [s3Command], visibility: "collapse" },
	]})

	private readonly ctx: FeatureContext

	constructor(argv: string[], private adapter: InterfaceAdapter) {
		// parse arguments
		const args = arg(cliArgsSpec, { permissive: true, argv })

		// set flags
		this.isDevelopment = args["--dev"] ?? false
		this.dataDir = determineDataDir(this, args["--data-dir"])
		this.setupLogs(args["--log-file"])

		const filen = new FilenSDK({
			...ANONYMOUS_SDK_CONFIG,
			connectToSocket: true, // Needed to keep internal SDK FS tree up to date with remote changes
			metadataCache: true,
			tmpPath: path.join(os.tmpdir(), "filen-cli")
		})

		// parse cmd and argv (handle --help, --version)
		let cmd: string | undefined = undefined
		let parsedArgv = args["_"]
		if (args["--help"]) {
			cmd = "help"
		} else if (args["--version"]) {
			cmd = "version"
		} else if (parsedArgv.length > 0) {
			cmd = parsedArgv[0]!
			parsedArgv = parsedArgv.slice(1)
		}

		this.ctx = {
			app: this,
			filen,
			cloudWorkingPath: args["--root"] !== undefined ? new CloudPath([]).navigate(args["--root"]) : new CloudPath([]),
			cmd,
			argv: parsedArgv,
			cliArgs: args,
			verbose: args["--verbose"] ?? false,
			quiet: args["--quiet"] ?? false,
			formatJson: args["--json"] ?? false,
		}
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
	public out(message: string, options?: { indentation?: number }) {
		if (options?.indentation) {
			message = message.split("\n").map(line => "    ".repeat(options.indentation!) + line).join("\n")
		}
		this.adapter.out(message)
		this.writeLog(message, "log")
	}

	/**
	 * Shorthand for `if (!app.quiet) app.out(message)`
	 */
	public outUnlessQuiet(message: string, options?: Parameters<typeof this.out>[1]) {
		if (!this.ctx.quiet) this.out(message, options)
	}

	/**
	 * Global output method, only prints if `--verbose` flag is set
	 */
	public outVerbose(message: string, options?: Parameters<typeof this.out>[1]) {
		if (this.ctx.verbose) {
			this.out(message, options)
		} else {
			this.writeLog(message, "log")
		}
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
			await main(this.ctx)
		} catch (e) {
			if (e !== exitCode1Error) this.handleExitError(e)
			status = false
		}
		this.writeLogsToDisk()
		return status
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

async function main(ctx: FeatureContext) {
	const { app, filen, cliArgs, cmd, argv } = ctx

	app.outVerbose(`Filen CLI ${version}`)

	// print info about environment
	let environment = "Environment: "
	environment += `data-dir=${app.dataDir}`
	if (isRunningAsContainer) environment += ", in container"
	if (isRunningAsNPMPackage) environment += ", as NPM package"
	if (app.isDevelopment) environment += ", development"
	app.outVerbose(environment)

	// check for updates
	if (cliArgs["--skip-update"] !== true) {
		const updater = new Updater(app)
		if (cmd === "canary") {
			try {
				await updater.showCanaryPrompt()
				return
			} catch (e) {
				app.errExit("change canary preferences", e)
			}
		}
		if (cmd === "install") {
			try {
				const version = argv[0]
				if (version === undefined) app.errExit("Need to specify version")
				await updater.fetchAndInstallVersion(version!)
				return
			} catch (e) {
				app.errExit("install version", e)
			}
		}
		try {
			await updater.checkForUpdates(cliArgs["--force-update"] ?? false, cliArgs["--auto-update"] ?? false)
		} catch (e) {
			app.errExit("check for updates", e)
		}
		// todo: make `canary` and `install` features
	} else {
		app.outVerbose("Update check skipped")
	}

	const feature = (() => {
		if (cmd === undefined) return undefined
		const feature = app.features.getFeature(cmd.toLowerCase())
		if (feature === undefined) app.errExit(`Unknown command: ${cmd}`)
		return feature
	})()

	// authentication
	if (!feature?.skipAuthentication) {
		const authentication = new Authentication(app, filen)
		try {
			if (argv[0] === "logout") {
				await authentication.deleteSavedCredentials()
				// todo: make `logout` a feature
				return
			}
		} catch (e) {
			app.outErr("delete credentials", e)
		}
		try {
			const { exit } = await authentication.authenticate(
				cliArgs["--email"],
				cliArgs["--password"],
				cliArgs["--two-factor-code"],
				argv[0] === "export-auth-config", // todo: make `export-auth-config` a feature
				argv[0] === "export-api-key", // todo: make `export-api-key` a feature
			)
			if (exit) return
		} catch (e) {
			app.errExit("authenticate", e)
		}
	}

	const executeCommand = async (feature: Feature, ctx: FeatureContext) => {
		// check arguments
		const minArgumentsCount = feature.arguments.filter(arg => arg.optional !== true).length
		if (ctx.argv.length < minArgumentsCount) {
			app.outErr(`Need to specify all arguments: ${feature.arguments.map(arg => arg.name + (arg.optional ? " (optional)" : "")).join(", ")}`)
			return {}
		}
		// todo: make more arguments explicit
		try {
			return await feature.invoke({ ...ctx, feature }) ?? {}
		} catch (e) {
			return app.errExit(`execute command ${feature.cmd[0]}`, e)
		}
	}

	if (feature !== undefined) {
		// execute single command
		app.resetThereHasBeenErrorOutput()
		const result = await executeCommand(feature, ctx)
		if (result.cloudWorkingPath !== undefined) {
			app.outErr("To navigate in a stateful environment, please invoke the CLI without any arguments.")
		}
		if (app.thereHasBeenErrorOutput) throw exitCode1Error
	} else {
		// interactive mode
		let cloudWorkingPath = ctx.cloudWorkingPath
		if (!cliArgs["--no-autocomplete"]) Autocompletion.instance = new Autocompletion(app, ctx.filen, cloudWorkingPath)
		while (true) {
			const input = await app.prompt(`${cloudWorkingPath.toString()} > `, { allowExit: true, useHistory: true })
			const interactiveCliArgs = arg(cliArgsSpec, { permissive: true, argv: [...argv, ...splitCommandSegments(input)] }) // combine process.argv and input
			// todo: do this?: params.args = args.map(arg => (arg.startsWith("\"") && arg.endsWith("\"")) ? arg.substring(1, arg.length - 1) : arg)
			if (interactiveCliArgs["_"].length === 0) continue
			const feature = app.features.getFeature(interactiveCliArgs["_"][0]!.toLowerCase())
			if (feature === undefined) {
				app.outErr(`Unknown command: ${interactiveCliArgs["_"][0]!.toLowerCase()}`)
				continue
			}
			const result = await executeCommand(feature, {
				...ctx,
				cloudWorkingPath,
				cmd: interactiveCliArgs["_"][0]!,
				argv: interactiveCliArgs["_"].slice(1),
				cliArgs: interactiveCliArgs,
				verbose: ctx.verbose || (interactiveCliArgs["--verbose"] ?? false),
				quiet: ctx.quiet || (interactiveCliArgs["--quiet"] ?? false),
				formatJson: ctx.formatJson || (interactiveCliArgs["--json"] ?? false),
			})
			if (result.exit) break
			if (result.cloudWorkingPath !== undefined) {
				cloudWorkingPath = result.cloudWorkingPath
				if (Autocompletion.instance) Autocompletion.instance.cloudWorkingPath = result.cloudWorkingPath
			}
		}
	}
}