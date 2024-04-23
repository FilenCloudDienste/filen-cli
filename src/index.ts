import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import { err, errExit, out, prompt } from "./interface"
import { executeCommand, navigateCloudPath, resolveCloudPath } from "./fs"
import * as fs from "node:fs"
import keytar from "keytar"

const args = arg({
	// arguments
	"--help": Boolean,
	"--root": String,
	"--delete-credentials": Boolean,
	"--verbose": Boolean,

	// aliases
	"-h": "--help",
	"-r": "--root",
	"-v": "--verbose"
})

if (args["--help"]) {
	out("Filen CLI v0.0.1")
	process.exit()
}

(async () => {

	if (args["--delete-credentials"]) {
		const credentials = await keytar.findCredentials("filen-cli")
		for (const credential of credentials) {
			await keytar.deletePassword("filen-cli", credential.account)
		}
		out("Credentials deleted")
	}

	const filen = new FilenSDK({
		metadataCache: true,
		tmpPath: path.join(os.tmpdir(), "filen-cli")
	})

	const storedCredentials = await keytar.findCredentials("filen-cli")
	if (storedCredentials.length > 0) {
		const credentials = storedCredentials[0]
		await filen.login({ email: credentials.account, password: credentials.password })
		if (args["--verbose"]) out(`Logged in as ${credentials.account} (using saved credentials)`)
	} else if (fs.existsSync(".filen-cli-credentials")) {
		const lines = fs.readFileSync(".filen-cli-credentials").toString().split("\n")
		if (lines.length < 2) errExit("Invalid .filen-cli-credentials!")
		await filen.login({ email: lines[0], password: lines[1] })
		if (args["--verbose"]) out(`Logged in as ${lines[0]} (using .filen-cli-credentials)`)
	} else {
		out("Please enter your Filen credentials:")
		const email = await prompt("Email: ")
		const password = await prompt("Password: ")
		if (!email || !password) errExit("Please provide your credentials!")
		await filen.login({ email, password })

		const saveCredentials = (await prompt("Save credentials locally for future invocations? [y/N] ")).toLowerCase() === "y"
		if (saveCredentials) {
			await keytar.setPassword("filen-cli", email, password)
			out("You can delete these credentials using `filen --delete-credentials`")
		}

		out("")
	}

	const cloudRootPath = args["--root"] !== undefined ? navigateCloudPath([], args["--root"]) : []
	if (args["_"].length === 0) {
		let cloudWorkingPath: string[] = cloudRootPath
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const command = await prompt(`${resolveCloudPath(cloudWorkingPath)} > `)
			if (command === "") continue
			const cmd = command.split(" ")[0].toLowerCase()
			const args = command.split(" ").splice(1)
			const result = await executeCommand(filen, cloudWorkingPath, cmd, args)
			if (result.exit) break
			if (result.cloudWorkingPath !== undefined) cloudWorkingPath = result.cloudWorkingPath
		}
	} else {
		const result = await executeCommand(filen, cloudRootPath, args["_"][0], args["_"].slice(1))
		if (result.cloudWorkingPath !== undefined) err("To navigate in a stateful environment, please invoke the CLI without any arguments.")
	}
	process.exit()

})()