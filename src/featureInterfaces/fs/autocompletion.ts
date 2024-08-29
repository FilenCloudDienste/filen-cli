import { CompleterResult } from "node:readline"
import { Command, fsCommands, splitCommandSegments } from "./commands"
import FilenSDK from "@filen/sdk"
import { CloudPath } from "../../util/cloudPath"
import * as fs from "node:fs"
import pathModule from "path"

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
		autocomplete(input, this.cloudWorkingPath, fsCommands, (path) => this.readCloudDirectory(path), (path) => this.readLocalDirectory(path))
			.then(result => this.autocompleteResults.set(input, result))
	}

	public clearPrefetchedResults() {
		this.autocompleteResults.clear()
	}

	/**
	 * @return pre-fetched autocomplete results for a given user input
	 */
	public autocomplete(input: string): CompleterResult {
		return this.autocompleteResults.get(input) ?? [[], input]
	}

	private cachedCloudPaths: string[] = []

	private async readCloudDirectory(path: string): Promise<Item[]> {
		if (!this.cachedCloudPaths.includes(path)) {
			await this.filen.fs().readdir({ path })
			this.cachedCloudPaths.push(path)
		}
		return Object.keys(this.filen.fs()._items)
			.filter(cachedPath => cachedPath.startsWith(path) && cachedPath !== path)
			.map(cachedPath => ({ name: cachedPath, type: this.filen.fs()._items[cachedPath]!.type }))
			.map(item => ({
				...item,
				name: item.name.includes("/") ? item.name.substring(item.name.lastIndexOf("/") + 1) : item.name
			}))
	}

	private cachedLocalItems = new Map<string, Item[]>()

	private async readLocalDirectory(path: string) {
		if (!this.cachedLocalItems.has(path)) {
			const itemNames = await fs.promises.readdir("./" + path)
			const items: Item[] = await Promise.all(itemNames.map(async name => {
				const type = (await fs.promises.stat(pathModule.join(path, name))).isDirectory() ? "directory" : "file"
				return { name, type }
			}))
			this.cachedLocalItems.set(path, items)
		}
		return this.cachedLocalItems.get(path)!
	}
}

export type Item = {
	name: string,
	type: "directory" | "file"
}

/**
 * Generate autocompletion results for a given input.
 * @param input The user input.
 * @param cloudWorkingPath The current cloud working path.
 * @param availableCommands The commands available to the user.
 * @param readCloudDirectory Callback function that should return the items inside a cloud location, or throw an error if it doesn't exist.
 * @param readLocalDirectory Callback function that should return the items inside a local location, or throw an error if it doesn't exist.
 */
export async function autocomplete(
	input: string,
	cloudWorkingPath: CloudPath,
	availableCommands: Command[],
	readCloudDirectory: (path: string) => Promise<Item[]>,
	readLocalDirectory: (path: string) => Promise<Item[]>
): Promise<CompleterResult> {
	const segments = splitCommandSegments(input)
	if (segments.length < 2) { // typing command
		const commands = availableCommands.flatMap(cmd => [cmd.cmd, ...cmd.aliases].map(alias => alias + (cmd.arguments.length > 0 ? " " : "")))
		const hits = commands.filter(cmd => cmd.startsWith(input))
		return [hits, input]
	} else { // typing arguments
		const argumentIndex = segments.length - 2
		const command = availableCommands.find(cmd => [cmd.cmd, ...cmd.aliases].includes(segments[0]!))
		if (command === undefined) return [[], input]
		const argument = command.arguments[argumentIndex]
		if (argument === undefined) return [[], input]
		const argumentInput = segments[segments.length - 1]!
		if (argument.type === "cloud_directory" || argument.type === "cloud_file" || argument.type === "cloud_path" || argument.type === "local_file" || argument.type === "local_path") {
			const filesystem = argument.type.startsWith("cloud") ? "cloud" : "local"
			const acceptFile = argument.type.endsWith("file") || argument.type.endsWith("path")

			const inputPath = filesystem === "cloud" ? cloudWorkingPath.navigate(argumentInput).toString() : argumentInput
			let autocompleteOptions: string[]
			try {
				const items = await (filesystem === "cloud" ? readCloudDirectory(inputPath) : readLocalDirectory(inputPath))
				const acceptedItems = items.filter(item => item.type === "file" ? acceptFile : true)
				autocompleteOptions = acceptedItems.map(item => argumentInput + ((argumentInput.endsWith("/") || argumentInput === "") ? "" : "/") + item.name)
			} catch (e) { // path does not exist
				try {
					const inputPathParent = inputPath.substring(0, inputPath.lastIndexOf("/"))
					const items = await (filesystem === "cloud" ? readCloudDirectory(inputPathParent) : readLocalDirectory(inputPathParent))
					const acceptedItems = items.filter(item => item.type === "file" ? acceptFile : true)
					autocompleteOptions = acceptedItems.map(item => argumentInput.substring(0, argumentInput.lastIndexOf("/") + 1) + item.name)
				} catch (e) {
					return [[], input]
				}
			}
			const options = autocompleteOptions
				.filter(option => option.startsWith(argumentInput))
				.map(option => option.includes(" ") ? `"${option}"` : option)
			return [options, argumentInput]
		} else {
			return [[], input]
		}
	}
}
