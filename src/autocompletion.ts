import { CompleterResult } from "node:readline"
import { fsCommands } from "./commands"
import FilenSDK from "@filen/sdk"
import { CloudPath } from "./cloudPath"

export class Autocompletion {
	public static instance?: Autocompletion

	private readonly filen: FilenSDK
	public cloudWorkingPath: CloudPath

	public constructor(filen: FilenSDK, cloudWorkingPath: CloudPath) {
		this.filen = filen
		this.cloudWorkingPath = cloudWorkingPath
	}

	private autocompleteResults = new Map<string, CompleterResult>()

	public prefetchForInput(input: string) {
		this._autocomplete(input).then(result => {
			this.autocompleteResults.set(input, result)
		})
	}

	public autocomplete(input: string): CompleterResult {
		return this.autocompleteResults.get(input) ?? [[], input]
	}

	//TODO: use cached file tree from `filen.fs()._items`
	private async _autocomplete(input: string): Promise<CompleterResult> {
		const segments = input.split(" ")
		if (segments.length < 2) { // typing command
			const commands = fsCommands.map(cmd => cmd.cmd + (cmd.arguments.length > 0 ? " " : ""))
			const hits = commands.filter(cmd => cmd.startsWith(input))
			return [hits, input]
		} else { // typing arguments
			const argumentIndex = segments.length - 2
			const command = fsCommands.find(cmd => cmd.cmd === segments[0])
			if (command === undefined) return [[], input]
			const argument = command.arguments[argumentIndex]
			const argumentInput = segments[segments.length - 1]
			if (argument.type === "cloud_directory" || argument.type === "cloud_file" || argument.type === "cloud_path") {
				const inputPath = this.cloudWorkingPath.navigate(argumentInput)
				let autocompleteOptions: string[]
				try {
					console.log("[[[")
					console.log("path:", inputPath.toString())
					const items = await this.filen.fs().readdir({ path: inputPath.toString() })
					console.log(" (successful) ")
					console.log("]]]")
					autocompleteOptions = items.map(item => argumentInput + ((argumentInput.endsWith("/") || argumentInput === "") ? "" : "/") + item)
				} catch (e) { // path does not exist
					try {
						const inputPathParent = new CloudPath(this.filen, inputPath.cloudPath.slice(0, inputPath.cloudPath.length - 1))
						const items = await this.filen.fs().readdir({ path: inputPathParent.toString() })
						autocompleteOptions = items.map(item => argumentInput.substring(0, argumentInput.lastIndexOf("/") + 1) + item)
					} catch (e) {
						return [[], input]
					} finally {
						console.log("]]]")
					}
				}
				const options = autocompleteOptions.filter(option => option.startsWith(argumentInput))
				return [options, argumentInput]
			} else if (argument.type === "local_file" || argument.type === "local_path") {
				//TODO: implement
				return [[], input]
			} else {
				return [[], input]
			}
		}
	}
}
