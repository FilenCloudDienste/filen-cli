import arg from "arg"
import { buildF, EmptyX, Extra, Feature, FeatureContext, FeatureGroup, FeatureRegistry, FeatureResult, parseArgs } from "./features"
import * as fs from "node:fs"
import * as pathModule from "node:path"
import os from "os"
import { Mutex } from "async-mutex"
import * as buffer from "buffer"
import { randomUUID } from "node:crypto"
import { formatTimestamp } from "./util"
import { CompleterResult } from "node:readline"
import { printHelp } from "./helpPage"
import { version } from "../buildInfo"

// see also ./README.md for technical documentation

const cliArgSpec = {
    "--dev": Boolean,

    "--help": Boolean,
    "-h": "--help",
    "--version": Boolean,

    "--verbose": Boolean,
    "-v": "--verbose",

    "--quiet": Boolean,
    "-q": "--quiet",

    "--log-file": String,
    "--data-dir": String,
    
    "--json": Boolean,
    "--no-autocomplete": Boolean,
}

export type AppInfo = {
	name: string,
	version: string,
}

/**
 * App manages application-wide configuration and console I/O, and provides the main entry point.
 */
export class App<X extends Extra> {
	/**
	 * Whether the application is run in a development environment (set via the `--dev` flag).
	 */
	public readonly isDevelopment 

	/**
	 * The directory where data files (configuration files, cache, credentials etc.) are stored.
	 */
	public readonly dataDir

	public readonly info: AppInfo
    public readonly adapter: InterfaceAdapter
    public readonly features: FeatureRegistry<X>
	private readonly ctx: FeatureContext<X>
    private readonly mainFeature: Feature<X>
    private readonly interactiveModePrompt?: (ctx: FeatureContext<X>) => string

	/**
	 * @param info Some metadata about the application, including name and version.
	 * @param argv Usually `process.argv.slice(2)`.
	 * @param adapter An InterfaceAdapter that handles console I/O, see index.ts.
	 * @param features The list of available features.
	 * @param mainFeature The feature that is the main function, having args and containing app-specific setup code.
	 * @param interactiveModePrompt Optionally, a custom string to be displayed before the `>` prompt in interactive mode.
	 */
	constructor({ info, argv, adapter, features, defaultCtx, mainFeature, interactiveModePrompt }: {
        info: AppInfo,
        argv: string[],
        adapter: InterfaceAdapter,
        features: (Feature<X> | FeatureGroup<X>)[],
        defaultCtx: X["FeatureContext"],
        mainFeature: Feature<X>,
        interactiveModePrompt?: (ctx: FeatureContext<X>) => string,
    }) {
		this.info = info
        this.adapter = adapter
        this.mainFeature = mainFeature
        this.interactiveModePrompt = interactiveModePrompt

		// export docs json
		if (argv.includes("internal-export-docs-json")) {
			const json = JSON.stringify({ version, features}, null, 2)
			fs.writeFileSync("filen-cli-docs.json", json)
			this.out("Exported docs JSON to filen-cli-docs.json")
			process.exit()
		}
        
		const f = buildF<EmptyX>()
		const helpCommand = f.feature({
			cmd: ["help", "h", "?"],
			args: {
				section: f.catchAllArg({ name: "section or command", description: "the section or command to display help for" }),
			},
			description: "Display usage information.",
			builtin: true,
			invoke: async ({ app, args, isInteractiveMode }) => {
				const selectedName = args.section.join(" ").toLowerCase()
				printHelp(app, selectedName, isInteractiveMode)
			}
		})
		const versionCommand = f.feature({
			cmd: ["version", "v"],
			description: `Display the version of ${this.info.name}.`,
			builtin: true,
			invoke: async ({ app }) => {
				app.out(`${this.info.name} ${this.info.version}`)
			}
		})
		this.features = new FeatureRegistry({ features: [
			{ features: [helpCommand, versionCommand], visibility: "hide" },
			...features
		] })

		// parse arguments
		const args = arg(cliArgSpec, { permissive: true, argv })

		// set flags
		this.isDevelopment = args["--dev"] ?? false
		this.dataDir = determineDataDir(args["--data-dir"], this.isDevelopment)
		this.setupLogs(args["--log-file"])

		// handle --help, --version
		let parsedArgv = args["_"]
		if (args["--help"]) {
			parsedArgv = ["help", ...parsedArgv]
		} else if (args["--version"]) {
			parsedArgv = ["version", ...parsedArgv]
		}

		this.ctx = {
			app: this,
			argv: parsedArgv,
			verbose: args["--verbose"] ?? false,
			quiet: args["--quiet"] ?? false,
			formatJson: args["--json"] ?? false,
            isInteractiveMode: false,
            x: defaultCtx,
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

	/**
	 * Global error output method. Outputs an error without throwing it.
	 * @see errExit
	 */
	public outErr(messageOrAction: string, underlyingError?: unknown, additionalMessage?: string) {
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

	/**
	 * Exit (without throwing an exception).
	 */
	public exit(): never {
		throw justExitError
	}

	/**
	 * Outputs a user-facing error without exiting.
	 * @parame the ExitError, or another Error that will be printed as "unexpected"
	 */
	public handleExitError(e: unknown) {
		if (e === justExitError) {
			throw e
		} else if (e instanceof ExitError) {
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
	 * @param options.autocompletionCtx FeatureContext<X> for FeatureRegistry.autocomplete (leave out to disable autcompletion)
	 * @param options.allowExit Whether to allow to exit the application here via `^C`
	 * @param options.obfuscate Whether to obfuscate the input (for password input)
	 * @param options.useHistory Whether to read from and append to the history
	 */
	public async prompt(message: string, options: { autocompletionCtx?: FeatureContext<X>, allowExit?: boolean, obfuscate?: boolean, useHistory?: boolean } = {}) {
		return new Promise<string>((resolve) => {
			const autocomplete = async (input: string): Promise<CompleterResult> => {
				if (!options.autocompletionCtx) return [[], ""]
				try {
					return await this.features.autocomplete(options.autocompletionCtx!, input)
				} catch (e) {
					return this.errExit("autocomplete", e)
				}
			}
			try {
				this.adapter.prompt(message, options.obfuscate ?? false, options.useHistory ? this.readlineHistory : undefined, options.allowExit ?? false, autocomplete)
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
            let ctx = this.ctx

            // determine feature
            if (ctx.argv.length > 0) {
				const foundFeature = this.features.findFeature(ctx.argv.join(" ").toLowerCase())
				if (foundFeature === undefined) return this.errExit(`Unknown command: ${ctx.argv.join(" ")}`)
				ctx.cmd = foundFeature.cmd
				ctx.argv = ctx.argv.slice(foundFeature.cmd.split(" ").length)
				ctx.feature = foundFeature.feature
			}

            // execute main
			const mainResult = await this.mainFeature.invoke({ ...this.ctx, feature: this.mainFeature })
            ctx = typeof mainResult === "object" ? { ...ctx, ...(mainResult as FeatureResult<X>).ctx } : this.ctx
            ctx.argv = parseArgs(this.mainFeature, ctx.argv)["_"]

			if (ctx.feature !== undefined) {
				// execute single command
                await ctx.feature.invoke({ ...ctx, feature: ctx.feature })
			} else {
				// interactive mode
				while (true) {
                    const prompt = this.interactiveModePrompt ? this.interactiveModePrompt(ctx) : undefined
					const input = await this.prompt(`${prompt ?? ""}${prompt !== undefined ? " " : ""}> `, { autocompletionCtx: ctx, allowExit: true, useHistory: true })
					const interactiveCliArgs = arg(cliArgSpec, { permissive: true, argv: [...ctx.argv, ...splitCommandSegments(input)] }) // combine process.argv and input
					// todo: do this?: params.args = args.map(arg => (arg.startsWith("\"") && arg.endsWith("\"")) ? arg.substring(1, arg.length - 1) : arg)
					if (interactiveCliArgs["_"].length === 0) continue
					const foundFeature = this.features.findFeature(interactiveCliArgs["_"].join(" ").toLowerCase())
					if (foundFeature === undefined) {
						this.outErr(`Unknown command: ${interactiveCliArgs["_"][0]!.toLowerCase()}`)
						continue
					}
					const { cmd, feature } = foundFeature
					try {
						const result = await feature.invoke({
							...ctx, feature,
							isInteractiveMode: true,
							cmd, argv: interactiveCliArgs["_"].slice(cmd.split(" ").length),
							verbose: ctx.verbose || (interactiveCliArgs["--verbose"] ?? false),
							quiet: ctx.quiet || (interactiveCliArgs["--quiet"] ?? false),
							formatJson: ctx.formatJson || (interactiveCliArgs["--json"] ?? false),
						})
						if (result?.exit) break
                        ctx = { ...ctx, ...result?.ctx }
					} catch (e) {
						this.handleExitError(e)
					}
				}
			}

		} catch (e) {
			if (e !== exitCode1Error && e !== justExitError) this.handleExitError(e)
			if (e !== justExitError) status = false
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
	prompt(message: string, obfuscate: boolean, history: string[] | undefined, allowExit: boolean, autocomplete: (input: string) => Promise<CompleterResult>): Promise<string>
	addInterruptListener(listener: () => void): void
}

export class ExitError extends Error {}

// throw this when no additional error should be printed, but exit code 1 should be returned
const exitCode1Error = new ExitError("Exit code 1")

// throw this when you just want to exit without an error
const justExitError = new ExitError("{just exit}")

/**
 * Determines the platform-specific directory for storing data files.
 * Creates the directory if it doesn't exist.
 * Default locations are: `%APPDATA%\filen-cli` (Windows), `~/Library/Application Support/filen-cli` (macOS), `$XDG_CONFIG_HOME/filen-cli` or `~/.config/filen-cli` (Unix). 
 * If it exists, `~/.filen-cli` is used instead.
 * If the `--data-dir` flag or `FILEN_CLI_DATA_DIR` environment variable is set, its value is used instead.
 */
function determineDataDir(dataDirFlag: string | undefined, isDevelopment: boolean): string {
	if (dataDirFlag !== undefined) return dataDirFlag
	if (process.env.FILEN_CLI_DATA_DIR !== undefined) return process.env.FILEN_CLI_DATA_DIR

	// default config path, see https://github.com/jprichardson/ospath/blob/master/index.js
	let dataDir = (() => {
		switch (process.platform) {
			case "win32": return pathModule.resolve(process.env.APPDATA!)
			case "darwin": return pathModule.resolve(pathModule.join(os.homedir(), "Library/Application Support/"))
			default: return process.env.XDG_CONFIG_HOME
				? pathModule.resolve(process.env.XDG_CONFIG_HOME)
				: pathModule.resolve(pathModule.join(os.homedir(), ".config/"))
		}
	})()
	if (dataDir.length === 0) throw Error("Could not determine config path.")

	// use install location of install.sh install script, if it exists
	if (fs.existsSync(pathModule.join(os.homedir(), ".filen-cli"))) {
		dataDir = pathModule.resolve(pathModule.join(os.homedir(), ".filen-cli"))
	}

	// append "filen-cli", "dev"
	if (!(dataDir.includes("filen-cli"))) dataDir = pathModule.join(dataDir, "filen-cli")
	if (isDevelopment) dataDir = pathModule.join(dataDir, "dev")

	// create if it doesn't exist
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, {
			recursive: true
		})
	}

	return dataDir
}

/**
 * Splits a command input into segments, while respecting quotes.
 * Example: `'cd "folder name"'` returns `['cd', '"folder name"']`.
 */
export function splitCommandSegments(input: string): string[] {
	const segments: string[] = []
	let buffer = ""
	let insideQuotes = false
	input.split("").forEach(c => {
		if (c === "\"") insideQuotes = !insideQuotes
		if (c === " " && !insideQuotes) {
			segments.push(buffer)
			buffer = ""
		} else {
			buffer += c
		}
	})
	if (buffer.length > 0) segments.push(buffer)
	return segments
}
