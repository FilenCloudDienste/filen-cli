import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import { err, errExit, errorOccurred, out, prompt } from "./interface"
import * as fsModule from "node:fs"
import keytar from "keytar"
import { CloudPath } from "./cloudPath"
import { FS } from "./fs"
import { InterruptHandler } from "./interrupt"

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

	// aliases
	"-h": "--help",
	"-r": "--root",
	"-v": "--verbose",
	"-q": "--quiet",
	"-e": "--email",
	"-p": "--password"
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
	if (args["--email"] !== undefined) {
		const email = args["--email"]
		const password = args["--password"]
		if (password === undefined) errExit("Need to also specify argument --password")
		await filen.login({ email, password })
		if (args["--verbose"]) out(`Logged in as ${email} (using arguments)`)
	} else if (process.env.FILEN_EMAIL !== undefined) {
		const email = process.env.FILEN_EMAIL
		const password = process.env.FILEN_PASSWORD
		if (password === undefined) errExit("Need to also specify environment variable FILEN_PASSWORD")
		await filen.login({ email, password })
		if (args["--verbose"]) out(`Logged in as ${email} (using environment variables)`)
	} else if (storedCredentials.length > 0) {
		const credentials = storedCredentials[0]
		await filen.login({ email: credentials.account, password: credentials.password })
		if (args["--verbose"]) out(`Logged in as ${credentials.account} (using saved credentials)`)
	} else if (fsModule.existsSync(".filen-cli-credentials")) {
		const lines = fsModule.readFileSync(".filen-cli-credentials").toString().split("\n")
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

	const quiet = args["--quiet"]!
	const formatJson = args["--json"]!

	const fs = new FS(filen)
	const cloudRootPath = args["--root"] !== undefined ? new CloudPath(filen, []).navigate(args["--root"]) : new CloudPath(filen, [])
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
			if (result.cloudWorkingPath !== undefined) cloudWorkingPath = result.cloudWorkingPath
		}
	} else {
		const result = await fs.executeCommand(cloudRootPath, args["_"][0], args["_"].slice(1), formatJson, quiet)
		if (errorOccurred) process.exit(1)
		if (result.cloudWorkingPath !== undefined) err("To navigate in a stateful environment, please invoke the CLI without any arguments.")
	}
	process.exit()

})()