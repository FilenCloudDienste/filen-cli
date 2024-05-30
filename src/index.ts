import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import { out } from "./interface/interface"
import { Authentication } from "./auth/auth"
import { version } from "./buildInfo"
import { Updater } from "./updater"
import { helpPage } from "./interface/helpPage"
import { FSInterface } from "./fs/fsInterface"

const args = arg({
	// arguments
	"--dev": Boolean,
	"--help": Boolean,
	"--root": String,
	"--delete-credentials": Boolean,
	"--verbose": Boolean,
	"--json": Boolean,
	"--quiet": Boolean,
	"--email": String,
	"--password": String,
	"--two-factor-code": String,
	"--no-autocomplete": Boolean,

	// aliases
	"-h": "--help",
	"-r": "--root",
	"-v": "--verbose",
	"-q": "--quiet",
	"-e": "--email",
	"-p": "--password",
	"-c": "--two-factor-code"
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
