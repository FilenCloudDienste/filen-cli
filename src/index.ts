import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import { err, errorOccurred, out, prompt } from "./interface"
import { CloudPath } from "./cloudPath"
import { FS } from "./fs"
import { InterruptHandler } from "./interrupt"
import { Autocompletion } from "./autocompletion"
import { Authentication } from "./auth"

const args = arg({
	// arguments
	"--help": Boolean,
	"--root": String,
	"--delete-credentials": Boolean,
	"--verbose": Boolean,
	"--json": Boolean,
	"--quiet": Boolean,
	"--email": String,
	"--password": String,
	"--two-factor-code": String,
	"--no-autocomplete": String,

	// aliases
	"-h": "--help",
	"-r": "--root",
	"-v": "--verbose",
	"-q": "--quiet",
	"-e": "--email",
	"-p": "--password",
	"-c": "--two-factor-code"
})

if (args["--help"]) {
	out("Filen CLI v0.0.1")
	process.exit()
}

(async () => {

	const filen = new FilenSDK({
		metadataCache: true,
		tmpPath: path.join(os.tmpdir(), "filen-cli")
	})

	const authentication = new Authentication(filen, args["--verbose"] ?? false)
	if (args["--delete-credentials"]) await authentication.deleteStoredCredentials()
	await authentication.authenticate(args["--email"], args["--password"], args["--two-factor-code"])

	const quiet = args["--quiet"]!
	const formatJson = args["--json"]!

	const cloudRootPath = args["--root"] !== undefined ? new CloudPath(filen, []).navigate(args["--root"]) : new CloudPath(filen, [])
	const fs = new FS(filen)
	if (!args["--no-autocomplete"]) Autocompletion.instance = new Autocompletion(filen, cloudRootPath)

	if (args["_"].length === 0) {
		let cloudWorkingPath: CloudPath = cloudRootPath
		// eslint-disable-next-line no-constant-condition
		while (true) {
			InterruptHandler.instance.addListener(() => process.exit())
			const command = await prompt(`${cloudWorkingPath.toString()} > `)
			if (command === "") continue
			const cmd = command.split(" ")[0].toLowerCase()
			const args = command.split(" ").splice(1)
			const result = await fs.executeCommand(cloudWorkingPath, cmd, args, formatJson, quiet)
			if (result.exit) break
			if (result.cloudWorkingPath !== undefined) {
				cloudWorkingPath = result.cloudWorkingPath
				if (Autocompletion.instance) Autocompletion.instance.cloudWorkingPath = result.cloudWorkingPath
			}
		}
	} else {
		const result = await fs.executeCommand(cloudRootPath, args["_"][0], args["_"].slice(1), formatJson, quiet)
		if (errorOccurred) process.exit(1)
		if (result.cloudWorkingPath !== undefined) err("To navigate in a stateful environment, please invoke the CLI without any arguments.")
	}
	process.exit()

})()