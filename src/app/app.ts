import { InterfaceAdapter } from "../framework/app"
import FilenSDK, { FilenSDKConfig } from "@filen/sdk"
import path from "path"
import os from "os"
import { isRunningAsContainer, isRunningAsNPMPackage, version } from "../buildInfo"
import { canaryCommand, installCommand, runUpdater, updateHelpText } from "./updater"
import { CloudPath } from "./util/cloudPath"
import { authenticate, authenticationCommandGroup } from "./auth"
import { formatTable } from "../framework/util"
import dedent from "dedent"
import { fsCommands } from "./featureInterfaces/fs"
import { syncCommand } from "./featureInterfaces/syncInterface"
import { driveMountingCommand } from "./featureInterfaces/driveMountingInterface"
import { webdavCommandGroup } from "./featureInterfaces/webdavInterface"
import { s3Command } from "./featureInterfaces/s3Interface"
import { f } from "./f"

export const app = (argv: string[], adapter: InterfaceAdapter) => f.app({
	info: {
		name: "Filen CLI",
		version
	},
	features: [
		{ features: [canaryCommand, installCommand], visibility: "hide" },
		f.helpText({ name: "general", text: dedent`
			Usage: filen [options...] [cmd]

			Invoke the Filen CLI with no command specified to enter interactive mode. 
			There you can specify paths as absolute (starting with "/") or
			relative to the current working directory (supports "." and "..").

			Data directory:
			The data directory is where configuration files, credentials, cache etc. are
			stored and read from. By default, it is \`%APPDATA%/filen-cli\` (Windows),
			\`~/Library/Application Support/filen-cli\` (macOS) or \`$XDG_CONFIG_HOME/filen-cli\`
			or \`~/.config/filen-cli\` (Unix). If there is a directory named \`.filen-cli\` at
			the home directory \`~\`, it is used instead (for instance, the install script
			installs to this location). You can overwrite the location using the
			\`--data-dir <dir>\` flag or the \`FILEN_CLI_DATA_DIR\` environment variable.

			Options:
			${formatTable([
				["--verbose, -v", "display additional information"],
				["--quiet, -q", "hide things like progress bars and additional logs"],
				["--log-file <file>", "write logs to a file"]
			])}
		` }),
		{ ...authenticationCommandGroup, visibility: "collapse" },
		{ ...updateHelpText, visibility: "collapse" },
		f.helpText({ name: undefined, text: "List of commands:" }),
		{ ...fsCommands, visibility: "collapse" },
		{ title: "Syncing", features: [syncCommand], visibility: "collapse" },
		{ title: "Network drive mounting", features: [driveMountingCommand], visibility: "collapse" },
		{ ...webdavCommandGroup, visibility: "collapse" },
		{ title: "S3 server", features: [s3Command], visibility: "collapse" },
	],
	argv, adapter,
	defaultCtx: {
		filen: new FilenSDK({
			...ANONYMOUS_SDK_CONFIG,
			connectToSocket: true,
			metadataCache: true,
			tmpPath: path.join(os.tmpdir(), "filen-cli")
		}),
		cloudWorkingPath: new CloudPath([]),
	},
	mainFeature: f.feature({
		cmd: ["filen"],
		description: "The Filen CLI application.",
		args: {
			email: f.option({ name: "--email", alias: "-e", description: "your Filen account's email address", valueName: "email" }),
			password: f.option({ name: "--password", alias: "-p", description: "your Filen account's password", valueName: "password" }),
			twoFactorCode: f.option({ name: "--two-factor-code", alias: "-c", description: "your Filen account's two-factor authentication code", valueName: "2fa" }),
			skipUpdate: f.flag({ name: "--skip-update", description: "skip checking for updates" }),
			forceUpdate: f.flag({ name: "--force-update", description: "check for updates even if it was recently checked" }),
			autoUpdate: f.flag({ name: "--auto-update", description: "skip the confirmation prompt and update automatically (will still exit after updating)" }),
			rootPath: f.option({ name: "--root", alias: "-r", description: "to execute a stateless command from a different cloud working directory", valueName: "path" }),
		},
		invoke: async (ctx) => {
			const { app, cmd, argv, args } = ctx

			app.outVerbose(`Filen CLI ${version}`)

			// print info about environment
			let environment = "Environment: "
			environment += `data-dir=${app.dataDir}`
			if (isRunningAsContainer) environment += ", in container"
			if (isRunningAsNPMPackage) environment += ", as NPM package"
			if (app.isDevelopment) environment += ", development"
			app.outVerbose(environment)

			// check for updates
			runUpdater(ctx, args)

			// authentication
			const selectedFeature = cmd === undefined ? undefined : app.features.findFeature(cmd + argv.join(" "))?.feature
			if (!selectedFeature?.skipAuthentication && !selectedFeature?.builtin) {
				await authenticate(ctx, args)
			}
			
			// apply root path (cannot be handled directly in args, since ctx.x.filen is then not yet authenticated)
			const cloudWorkingPath = ctx.x.cloudWorkingPath.navigate(args.rootPath ?? "")
			try {
				const stat = await ctx.x.filen.fs().stat({ path: cloudWorkingPath.toString() })
				if (stat.type !== "directory") {
					app.errExit(`The specified root path is not a directory: ${cloudWorkingPath.toString()}`)
				}
			} catch (e) {
				if (e instanceof Error && e.name === "FileNotFoundError") {
					app.errExit(`The specified root path does not exist: ${cloudWorkingPath.toString()}`)
				}
				throw e
			}

			return { ctx: { x: { ...ctx.x, cloudWorkingPath } } }
		},
	}),
	interactiveModePrompt: (ctx) => ctx.x.cloudWorkingPath.toString(),
})

export const ANONYMOUS_SDK_CONFIG: FilenSDKConfig = {
	email: "anonymous",
	password: "anonymous",
	masterKeys: ["anonymous"],
	connectToSocket: true,
	metadataCache: true,
	twoFactorCode: "anonymous",
	publicKey: "anonymous",
	privateKey: "anonymous",
	apiKey: "anonymous",
	authVersion: 2,
	baseFolderUUID: "anonymous",
	userId: 1
} as const