import { CompleterResult } from "node:readline"
import { fsCommands } from "./commands"
import FilenSDK from "@filen/sdk"
import { CloudPath } from "./cloudPath"
import * as fs from "node:fs"

/**
 * Provides autocompletion for fs commands, cloud paths and local paths.
 */
export class Autocompletion {
	/**
	 * The instance. Is `null` when autocompletion is disabled.
	 */
	public static instance: Autocompletion | null

	private readonly filen: FilenSDK
	public cloudWorkingPath: CloudPath

	public constructor(filen: FilenSDK, cloudWorkingPath: CloudPath) {
		this.filen = filen
		this.cloudWorkingPath = cloudWorkingPath
	}

	private autocompleteResults = new Map<string, CompleterResult>()

	/**
	 * Supply the current user input so autocomplete results can be pre-fetched asynchronously.
	 */
	public prefetchForInput(input: string) {
		if (this.autocompleteResults.has(input)) return
		this._autocomplete(input).then(result => {
			this.autocompleteResults.set(input, result)
		})
	}

	/**
	 * @return pre-fetched autocomplete results for a given user input
	 */
	public autocomplete(input: string): CompleterResult {
		return this.autocompleteResults.get(input) ?? [[], input]
	}

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
			if (argument.type === "cloud_directory" || argument.type === "cloud_file" || argument.type === "cloud_path" || argument.type === "local_file" || argument.type === "local_path") {
				const filesystem = argument.type.startsWith("cloud") ? "cloud" : "local"

				const inputPath = filesystem === "cloud" ? this.cloudWorkingPath.navigate(argumentInput).toString() : argumentInput
				let autocompleteOptions: string[]
				try {
					const items = await (filesystem === "cloud" ? this.readCloudDirectory(inputPath) : this.readLocalDirectory(inputPath))
					autocompleteOptions = items.map(item => argumentInput + ((argumentInput.endsWith("/") || argumentInput === "") ? "" : "/") + item)
				} catch (e) { // path does not exist
					try {
						const inputPathParent = inputPath.substring(0, inputPath.lastIndexOf("/") - 1)
						const items = await (filesystem === "cloud" ? this.readCloudDirectory(inputPathParent) : this.readLocalDirectory(inputPathParent))
						autocompleteOptions = items.map(item => argumentInput.substring(0, argumentInput.lastIndexOf("/") + 1) + item)
					} catch (e) {
						return [[], input]
					}
				}
				const options = autocompleteOptions.filter(option => option.startsWith(argumentInput))
				return [options, argumentInput]
			} else {
				return [[], input]
			}
		}
	}

	private cachedCloudPaths: string[] = []

	private async readCloudDirectory(path: string) {
		if (this.cachedCloudPaths.includes(path)) {
			return Object.keys(this.filen.fs()._items)
				.filter(cachedPath => cachedPath.startsWith(path) && cachedPath !== path)
				.map(cachedPath => cachedPath.includes("/") ? cachedPath.substring(cachedPath.lastIndexOf("/") + 1) : cachedPath)
		} else {
			const items = await this.filen.fs().readdir({ path })
			this.cachedCloudPaths.push(path)
			return items
		}
	}

	private cachedLocalItems = new Map<string, string[]>()

	private async readLocalDirectory(path: string) {
		if (this.cachedLocalItems.has(path)) {
			return this.cachedLocalItems.get(path)!
		} else {
			const items = fs.readdirSync("./" + path)
			this.cachedLocalItems.set(path, items)
			return items
		}
	}
}
