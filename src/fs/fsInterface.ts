import { CloudPath } from "../cloudPath"
import { FS } from "./fs"
import { Autocompletion } from "./autocompletion"
import { err, errorOccurred, prompt } from "../interface/interface"
import { splitCommandSegments } from "../interface/commands"
import FilenSDK from "@filen/sdk"

/**
 * Provides the interface for entering and parsing filesystem commands.
 * @see FS
 */
export class FSInterface {
	filen: FilenSDK

	constructor(filen: FilenSDK) {
		this.filen = filen
	}

	async invoke(args: {quiet: boolean, formatJson: boolean, root: string | undefined, noAutocomplete: boolean, commandStr: string[]}) {
		const cloudRootPath = args.root !== undefined ? new CloudPath([]).navigate(args.root) : new CloudPath([])
		const fs = new FS(this.filen)
		if (!args.noAutocomplete) Autocompletion.instance = new Autocompletion(this.filen, cloudRootPath)

		if (args.commandStr.length === 0) {
			let cloudWorkingPath: CloudPath = cloudRootPath
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const command = await prompt(`${cloudWorkingPath.toString()} > `, true)
				if (command === "") continue
				const segments = splitCommandSegments(command)
				const cmd = segments[0]!.toLowerCase()
				const cmdArgs = segments.splice(1)
				const result = await fs.executeCommand(cloudWorkingPath, cmd, cmdArgs, args.formatJson, args.quiet)
				if (result.exit) break
				if (result.cloudWorkingPath !== undefined) {
					cloudWorkingPath = result.cloudWorkingPath
					if (Autocompletion.instance) Autocompletion.instance.cloudWorkingPath = result.cloudWorkingPath
				}
			}
		} else {
			const result = await fs.executeCommand(cloudRootPath, args.commandStr[0]!, args.commandStr.slice(1), args.formatJson, args.quiet)
			if (errorOccurred) process.exit(1)
			if (result.cloudWorkingPath !== undefined)
				err("To navigate in a stateful environment, please invoke the CLI without any arguments.")
		}
		process.exit()
	}
}