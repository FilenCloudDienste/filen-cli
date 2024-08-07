import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import { errExit, out, setOutputFlags } from "./interface/interface"
import { Authentication } from "./auth/auth"
import { version } from "./buildInfo"
import { Updater } from "./updater"
import { HelpPage } from "./interface/helpPage"
import { FSInterface, fsOptions } from "./fs/fsInterface"
import { WebDAVInterface, webdavOptions } from "./mirror-server/webdavInterface"
import { S3Interface, s3Options } from "./mirror-server/s3Interface"
import { SyncInterface, syncOptions } from "./sync/syncInterface"
import { TrashInterface } from "./other/trashInterface"
import { PublicLinksInterface } from "./other/publicLinksInterface"

const args = arg({
	"--dev": Boolean,

	"--help": Boolean,
	"-h": "--help",

	"--delete-credentials": Boolean,

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

	...fsOptions,
	...webdavOptions,
	...s3Options,
	...syncOptions,
}, { permissive: true })

/**
 * Whether the application is run in a development environment (set via the `--dev` flag).
 */
export const isDevelopment = args["--dev"] ?? false

if (args["--help"] || args["--verbose"]) {
	out(`Filen CLI ${version}`)
	if (isDevelopment) out("Running in development environment")
}

if (args["--help"]) {
	const topic = args["_"][0]?.toLowerCase() ?? "general"
	const helpPage = new HelpPage().getHelpPage(topic)
	if (helpPage !== undefined) {
		out("\n" + helpPage)
	} else {
		errExit(`Unknown help page ${topic}`)
	}
	process.exit()
}

// eslint-disable-next-line no-extra-semi
;(async () => {
	const filen = new FilenSDK({
		metadataCache: true,
		tmpPath: path.join(os.tmpdir(), "filen-cli")
	})

	setOutputFlags(args["--quiet"] ?? false, args["--verbose"] ?? false)

	await new Updater().checkForUpdates()

	const authentication = new Authentication(filen)
	if (args["--delete-credentials"]) await authentication.deleteStoredCredentials()
	await authentication.authenticate(args["--email"], args["--password"], args["--two-factor-code"])

	if (args["_"][0] === "webdav" || args["_"][0] === "webdav-proxy") {

		// webdav
		const webdavInterface = new WebDAVInterface(filen)
		const proxyMode = args["_"][0] === "webdav-proxy"
		await webdavInterface.invoke(proxyMode, {
			username: args["--w-user"],
			password: args["--w-password"],
			https: args["--w-https"] ?? false,
			hostname: args["--w-hostname"],
			port: args["--w-port"],
			authScheme: args["--w-auth-scheme"],
		})

	} else if (args["_"][0] === "s3") {

		// s3
		const s3Interface = new S3Interface(filen)
		await s3Interface.invoke({
			hostname: args["--s3-hostname"],
			port: args["--s3-port"],
			https: args["--s3-https"] ?? false,
			accessKeyId: args["--s3-access-key-id"],
			secretAccessKey: args["--s3-secret-access-key"],
		})

	} else if (args["_"][0] === "sync") {

		// sync
		const syncInterface = new SyncInterface(filen)
		await syncInterface.invoke(args["_"].slice(1), args["--continuous"] ?? false, args["--disable-local-trash"] ?? false)

	} else if (args["_"][0] === "trash") {

		// trash
		const trashInterface = new TrashInterface(filen)
		await trashInterface.invoke(args["_"].slice(1))

	} else if (args["_"][0] === "links" || args["_"][0] === "link") {

		// links
		const publicLinksInterface = new PublicLinksInterface(filen)
		await publicLinksInterface.invoke(args["_"].slice(1))

	} else {

		// fs commands
		const fsInterface = new FSInterface(filen)
		await fsInterface.invoke({
			formatJson: args["--json"]!,
			root: args["--root"],
			noAutocomplete: args["--no-autocomplete"] ?? false,
			commandStr: args["_"],
		})

	}
})()
