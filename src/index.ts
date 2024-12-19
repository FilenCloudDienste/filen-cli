import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import { err, errExit, out, outVerbose, setOutputFlags, setupLogs } from "./interface/interface"
import { Authentication } from "./auth/auth"
import { checkInjectedBuildInfo, version } from "./buildInfo"
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

const args = arg(
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
		"--skip-update": Boolean,
		"--force-update": Boolean,

		...fsOptions,
		...webdavOptions,
		...s3Options,
		...syncOptions
	},
	{
		permissive: true
	}
)

if (!checkInjectedBuildInfo()) {
	errExit("Build info not injected correctly!")
}

/**
 * Whether the application is run in a development environment (set via the `--dev` flag).
 */
export const isDevelopment = args["--dev"] ?? false

// eslint-disable-next-line no-extra-semi
;(async () => {
	if ((args["--version"] ?? false) || args["_"][0] === "version") {
		out(version)
		process.exit()
	}

	setOutputFlags(args["--quiet"] ?? false, (args["--help"] ?? false) || (args["--verbose"] ?? false))
	setupLogs(args["--log-file"])

	outVerbose(`Filen CLI ${version}`)
	if (isDevelopment) outVerbose("Running in development environment")

	if ((args["--help"] ?? false) || args["_"][0] === "help") {
		const topic = (args["_"][0] === "help" ? args["_"][1] : args["_"][0])?.toLowerCase() ?? "general"
		const helpPage = new HelpPage().getHelpPage(topic)
		if (helpPage !== undefined) {
			out("\n" + helpPage)
		} else {
			errExit(`Unknown help page ${topic}`)
		}
		process.exit()
	}

	// check for updates
	if (args["--skip-update"] !== true) {
		try {
			await new Updater().checkForUpdates(args["--force-update"] ?? false)
		} catch (e) {
			errExit("check for updates", e)
		}
	} else {
		outVerbose("Update check skipped")
	}

	const filen = new FilenSDK({
		...ANONYMOUS_SDK_CONFIG,
		connectToSocket: true, // Needed to keep internal SDK FS tree up to date with remote changes
		metadataCache: true,
		tmpPath: path.join(os.tmpdir(), "filen-cli")
	})

	// authentication
	if (args["_"][0] !== "webdav-proxy") {
		// skip authentication for webdav proxy mode
		const authentication = new Authentication(filen)
		try {
			if (args["_"][0] === "delete-credentials") {
				await authentication.deleteStoredCredentials()
				process.exit()
			}
		} catch (e) {
			err("delete credentials", e)
		}
		try {
			await authentication.authenticate(
				args["--email"],
				args["--password"],
				args["--two-factor-code"],
				args["_"][0] === "export-auth-config"
			)
		} catch (e) {
			errExit("authenticate", e)
		}
	}

	if (args["_"][0] === "webdav" || args["_"][0] === "webdav-proxy") {
		// webdav
		const webdavInterface = new WebDAVInterface(filen)
		const proxyMode = args["_"][0] === "webdav-proxy"
		try {
			await webdavInterface.invoke(proxyMode, {
				username: args["--w-user"],
				password: args["--w-password"],
				https: args["--w-https"] ?? false,
				hostname: args["--w-hostname"],
				port: args["--w-port"],
				authScheme: args["--w-auth-scheme"],
				threads: args["--w-threads"]
			})
		} catch (e) {
			errExit("start WebDAV server", e)
		}
	} else if (args["_"][0] === "s3") {
		// s3
		const s3Interface = new S3Interface(filen)
		try {
			await s3Interface.invoke({
				hostname: args["--s3-hostname"],
				port: args["--s3-port"],
				https: args["--s3-https"] ?? false,
				accessKeyId: args["--s3-access-key-id"],
				secretAccessKey: args["--s3-secret-access-key"],
				threads: args["--s3-threads"]
			})
		} catch (e) {
			errExit("start S3 server", e)
		}
	} else if (args["_"][0] === "sync") {
		// sync
		const syncInterface = new SyncInterface(filen)
		try {
			await syncInterface.invoke(args["_"].slice(1), args["--continuous"] ?? false, args["--disable-local-trash"] ?? false)
		} catch (e) {
			errExit("invoke sync", e)
		}
	} else if (args["_"][0] === "trash") {
		// trash
		const trashInterface = new TrashInterface(filen)
		try {
			await trashInterface.invoke(args["_"].slice(1))
		} catch (e) {
			errExit("execute trash command", e)
		}
	} else if (args["_"][0] === "links" || args["_"][0] === "link") {
		// links
		const publicLinksInterface = new PublicLinksInterface(filen)
		await publicLinksInterface.invoke(args["_"].slice(1))
	} else if (args["_"][0] === "mount") {
		// mount
		const driveMountingInterface = new DriveMountingInterface(filen)
		try {
			await driveMountingInterface.invoke(args["_"][1])
		} catch (e) {
			errExit("execute mount command", e)
		}
	} else {
		// fs commands
		const fsInterface = new FSInterface(filen)
		await fsInterface.invoke({
			formatJson: args["--json"]!,
			root: args["--root"],
			noAutocomplete: args["--no-autocomplete"] ?? false,
			commandStr: args["_"]
		})
	}
})()
