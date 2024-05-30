import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import { out } from "./interface/interface"
import { Authentication } from "./auth/auth"
import { version } from "./buildInfo"
import { Updater } from "./updater"
import { helpPage } from "./interface/helpPage"
import { FSInterface, fsOptions } from "./fs/fsInterface"

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
})

export const filen = new FilenSDK({
	metadataCache: true,
	tmpPath: path.join(os.tmpdir(), "filen-cli")
})

/**
 * Whether the application is run in a development environment (set via the `--dev` flag).
 */
export const isDevelopment = args["--dev"] ?? false

if (args["--help"] || args["--verbose"]) {
	out(`Filen CLI ${version}`)
	if (isDevelopment) out("Running in development environment")
}

if (args["--help"]) {
	out(helpPage)
	process.exit()
}

// eslint-disable-next-line no-extra-semi
;(async () => {
	await new Updater().checkForUpdates(args["--verbose"] ?? false)

	const authentication = new Authentication(filen, args["--verbose"] ?? false)
	if (args["--delete-credentials"]) await authentication.deleteStoredCredentials()
	await authentication.authenticate(args["--email"], args["--password"], args["--two-factor-code"])

	const quiet = args["--quiet"]!
	const formatJson = args["--json"]!

	const fsInterface = new FSInterface(filen)
	await fsInterface.invoke({quiet, formatJson, root: args["--root"], noAutocomplete: args["--no-autocomplete"] ?? false, commandStr: args["_"]})
})()
