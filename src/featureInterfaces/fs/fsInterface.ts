import { CloudPath } from "../../util/cloudPath"
import { FS } from "./fs"
import { Autocompletion } from "./autocompletion"
import { splitCommandSegments } from "./commands"
import FilenSDK from "@filen/sdk"
import { App } from "../../app"

export const fsOptions = {
	"--root": String,
	"-r": "--root",
	"--json": Boolean,
	"--no-autocomplete": Boolean,
}

/**
 * Provides the interface for entering and parsing filesystem commands.
 * @see FS
 */
export class FSInterface {
	constructor(private app: App, private filen: FilenSDK) {}

	public async invoke(args: { formatJson: boolean, root: string | undefined, noAutocomplete: boolean, commandStr: string[] }) {
		const cloudRootPath = args.root !== undefined ? new CloudPath([]).navigate(args.root) : new CloudPath([])
		const fs = new FS(this.app, this.filen)
		if (!args.noAutocomplete) Autocompletion.instance = new Autocompletion(this.filen, cloudRootPath)

		if (args.commandStr.length === 0) {
			let cloudWorkingPath: CloudPath = cloudRootPath
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const command = await this.app.prompt(`${cloudWorkingPath.toString()} > `, { allowExit: true, useHistory: true })
				if (command === "") continue
				const segments = splitCommandSegments(command)
				const cmd = segments[0]!.toLowerCase()
				const cmdArgs = segments.splice(1)
				const result = await fs.executeCommand(cloudWorkingPath, cmd, cmdArgs, args.formatJson)
				if (result.exit) break
				if (result.cloudWorkingPath !== undefined) {
					cloudWorkingPath = result.cloudWorkingPath
					if (Autocompletion.instance) Autocompletion.instance.cloudWorkingPath = result.cloudWorkingPath
				}
			}
		} else {
			this.app.resetErrorOccurred()
			const result = await fs.executeCommand(cloudRootPath, args.commandStr[0]!, args.commandStr.slice(1), args.formatJson)
			if (this.app.errorOccurred) this.app.exit(false)
			if (result.cloudWorkingPath !== undefined)
				this.app.err("To navigate in a stateful environment, please invoke the CLI without any arguments.")
		}
	}
}