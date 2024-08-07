import { err, out, outJson, prompt, promptConfirm, quiet, verbose } from "../interface/interface"
import FilenSDK from "@filen/sdk"
import pathModule from "path"
import { directorySize, doNothing, getItemPaths, hashFile } from "../util"
import { CloudPath } from "../cloudPath"
import * as fsModule from "node:fs"
import { InterruptHandler } from "../interface/interrupt"
import open from "open"
import { fsCommands } from "./commands"
import { HelpPage } from "../interface/helpPage"
import { displayTransferProgressBar, formatBytes, formatTable, formatTimestamp } from "../interface/util"
import arg from "arg"

type CommandParameters = {
	cloudWorkingPath: CloudPath
	args: string[]
	formatJson: boolean
}

/**
 * Executes CLI commands related to cloud filesystem operations.
 * @see FSInterface
 */
export class FS {
	private readonly filen: FilenSDK

	public constructor(filen: FilenSDK) {
		this.filen = filen
	}

	/**
	 * Executes a filesystem command.
	 * @param cloudWorkingPath Where the command is executed (in a stateless environment, this is [])
	 * @param cmd
	 * @param args
	 * @param formatJson Whether to format the output as JSON.
	 * @returns Whether to exit the interactive environment, and where to navigate (via `cd` command)
	 */
	public async executeCommand(
		cloudWorkingPath: CloudPath,
		cmd: string,
		args: string[],
		formatJson: boolean
	): Promise<{
		exit?: boolean
		cloudWorkingPath?: CloudPath
	}> {
		if (cmd === "exit") return { exit: true }

		if (cmd === "help" || cmd === "?") {
			out("\n" + new HelpPage().getInteractiveModeHelpPage() + "\n")
			return {}
		}

		const params = { cloudWorkingPath, args, formatJson }

		const command = fsCommands.find(command => [command.cmd, ...command.aliases].includes(cmd))

		if (command === undefined) {
			err(`Unknown command: ${cmd}`)
			return {}
		}

		const minArgumentsCount = command.arguments.filter(arg => arg.optional !== true).length
		if (args.length < minArgumentsCount) {
			err(`Need to specify all arguments: ${command.arguments.map(arg => arg.name + (arg.optional ? " (optional)" : "")).join(", ")}`)
			return {}
		}

		if (command.cmd === "cd") {
			const cloudWorkingPath = await this._cd(params)
			return { cloudWorkingPath }
		}

		switch (command.cmd) {
			case "ls":
				await this._ls(params)
				break
			case "cat":
				await this._cat(params)
				break
			case "head":
				await this._headOrTail(params, "head")
				break
			case "tail":
				await this._headOrTail(params, "tail")
				break
			case "mkdir":
				await this._mkdir(params)
				break
			case "rm":
				await this._rm(params)
				break
			case "upload":
				await this._upload(params)
				break
			case "download":
				await this._download(params)
				break
			case "stat":
				await this._stat(params)
				break
			case "statfs":
				await this._statfs(params)
				break
			case "whoami":
				await this._whoami(params)
				break
			case "mv":
				await this._mv(params)
				break
			case "cp":
				await this._cp(params)
				break
			case "write":
				await this._write(params)
				break
			case "open":
				await this._openOrEdit(params, false)
				break
			case "edit":
				await this._openOrEdit(params, true)
				break
			case "view":
				await this._view(params)
				break
			case "favorites":
				await this._favoritesOrRecents(params, "favorites")
				break
			case "favorite":
				await this._favoriteOrUnfavorite(params, "favorite")
				break
			case "unfavorite":
				await this._favoriteOrUnfavorite(params, "unfavorite")
				break
			case "recents":
				await this._favoritesOrRecents(params, "recents")
				break
		}
		return {}
	}

	/**
	 * Execute a `cd` command
	 * @return the CloudPath navigated to, if successful
	 */
	private async _cd(params: CommandParameters) {
		const path = params.cloudWorkingPath.navigate(params.args[0]!)
		try {
			const directory = await this.filen.fs().stat({ path: path.toString() })
			if (!directory.isDirectory()) err("Not a directory")
			else return path
		} catch (e) {
			err("No such directory")
		}
	}

	/**
	 * Execute an `ls` command
	 */
	private async _ls(params: CommandParameters) {
		const args = arg({ "-l": Boolean }, { argv: params.args })
		const path = args["_"].length > 0 ? params.cloudWorkingPath.navigate(args["_"][0]!) : params.cloudWorkingPath
		try {
			if (args["-l"]) {
				const uuid = (await this.filen.fs().pathToItemUUID({ path: path.toString() }))
				if (uuid === null) throw new Error()
				const items = await this.filen.cloud().listDirectory({ uuid })
				if (params.formatJson) {
					outJson(items.map(item => {
						return {
							name: item.name,
							type: item.type,
							size: item.type === "file" ? item.size : undefined,
							modified: item.lastModified,
							favorited: item.favorited
						}
					}))
				} else {
					out(formatTable(items.map(item => [
						item.type === "file" ? formatBytes(item.size) : "",
						formatTimestamp(item.lastModified),
						item.name,
						item.favorited ? "(*)" : ""
					]), 2, true))
				}
			} else {
				const output = await this.filen.fs().readdir({ path: path.toString() })
				if (params.formatJson) outJson(output)
				else out(output.join("  "))
			}
		} catch (e) {
			err("No such directory")
		}
	}

	/**
	 * Execute a `cat` command
	 */
	private async _cat(params: CommandParameters) {
		const path = params.cloudWorkingPath.navigate(params.args[0]!)
		try {
			const fileSize = (await this.filen.fs().stat({ path: path.toString() })).size
			if (fileSize > 8192) {
				const result = await prompt(`This file is ${formatBytes(fileSize)} large. Continue? [y/N] `)
				if (result.toLowerCase() !== "y") return
			}
			const content = (await this.filen.fs().readFile({ path: path.toString() })).toString()
			if (params.formatJson) outJson({ text: content })
			else out(content)
		} catch (e) {
			err("No such file")
		}
	}

	/**
	 * Execute a `head` or `tail` command
	 */
	private async _headOrTail(params: CommandParameters, command: "head" | "tail") {
		const args = arg({ "-n": Number }, { argv: params.args })
		const n = args["-n" ] ?? 10
		const path = params.cloudWorkingPath.navigate(args["_"][0]!)
		try {
			const lines = (await this.filen.fs().readFile({ path: path.toString() })).toString().split("\n")
			const output = (command === "head" ? lines.slice(0, n) : lines.slice(lines.length - n)).join("\n")
			if (params.formatJson) outJson({ text: output })
			else out(output)
		} catch (e) {
			err("No such file")
		}
	}

	/**
	 * Execute an `mkdir` command
	 */
	private async _mkdir(params: CommandParameters) {
		await this.filen.fs().mkdir({ path: params.cloudWorkingPath.navigate(params.args[0]!).toString() })
	}

	/**
	 * Execute a `rm` command
	 */
	private async _rm(params: CommandParameters) {
		const args = arg({ "--no-trash": Boolean }, { argv: params.args })
		try {
			const path = params.cloudWorkingPath.navigate(args["_"][0]!).toString()
			if (!await promptConfirm(`${args["--no-trash"] ? "permanently delete": "delete"} ${path}`)) return
			if (args["--no-trash"]) if (!await promptConfirm(undefined)) return
			await this.filen.fs().rm({ path, permanent: args["--no-trash"] ?? false })
		} catch (e) {
			err("No such file or directory")
		}
	}

	/**
	 * Execute an `upload` command (upload a local file into the cloud)
	 */
	private async _upload(params: CommandParameters) {
		const source = params.args[0]!
		const stat =  fsModule.statSync(source)
		const size = stat.isDirectory() ? (await directorySize(source)) : stat.size
		const path = await params.cloudWorkingPath.navigateAndAppendFileNameIfNecessary(this.filen, params.args[1]!, source.split(/[/\\]/)[source.split(/[/\\]/).length - 1]!)
		const progressBar = quiet ? null : displayTransferProgressBar("Uploading", path.getLastSegment(), size)
		try {
			const abortSignal = InterruptHandler.instance.createAbortSignal()
			await this.filen.fs().upload({
				path: path.toString(),
				source,
				onProgress: quiet ? doNothing : progressBar!.onProgress,
				abortSignal
			})
		} catch (e) {
			if (progressBar) progressBar.progressBar.stop()
			err("Aborted")
		}
	}

	/**
	 * Execute a `download` command (download file form the cloud into local storage)
	 */
	private async _download(params: CommandParameters) {
		try {
			const source = params.cloudWorkingPath.navigate(params.args[0]!)
			const rawPath = params.args[1] === undefined || params.args[1] === "." ? process.cwd() + "/" : params.args[1]
			const path = rawPath.endsWith("/") || rawPath.endsWith("\\") ? pathModule.join(rawPath, source.cloudPath[source.cloudPath.length - 1]!) : rawPath
			const size = (await this.filen.fs().stat({ path: source.toString() })).size
			const progressBar = quiet ? null : displayTransferProgressBar("Downloading", source.getLastSegment(), size)
			try {
				const abortSignal = InterruptHandler.instance.createAbortSignal()
				await this.filen.fs().download({
					path: source.toString(),
					destination: path,
					onProgress: progressBar?.onProgress ?? doNothing,
					abortSignal
				})
			} catch (e) {
				if (progressBar) progressBar.progressBar.stop()
				err("Aborted")
			}
		} catch (e) {
			err("No such file")
		}
	}

	/**
	 * Execute a `stat` command
	 */
	private async _stat(params: CommandParameters) {
		try {
			const path = params.cloudWorkingPath.navigate(params.args[0]!)
			const stat = await this.filen.fs().stat({ path: path.toString() })
			const size = stat.isFile() ? stat.size : (await this.filen.cloud().directorySize({ uuid: stat.uuid })).size

			if (params.formatJson) {
				outJson({
					file: stat.name,
					type: stat.type,
					size: size,
					mtimeMs: stat.mtimeMs,
					birthtimeMs: stat.birthtimeMs
				})
			} else {
				out(`  File: ${stat.name}`)
				out(`  Type: ${stat.type}`)
				out(`  Size: ${formatBytes(size)}`)
				out(`Modify: ${formatTimestamp(stat.mtimeMs)}`)
				out(` Birth: ${formatTimestamp(stat.birthtimeMs)}`)
			}
		} catch (e) {
			err("No such file")
		}
	}

	/**
	 * Execute a `statfs` command
	 */
	private async _statfs(params: CommandParameters) {
		const statfs = await this.filen.fs().statfs()
		if (params.formatJson) {
			outJson({
				used: statfs.used,
				max: statfs.max
			})
		} else {
			out(`Used: ${formatBytes(statfs.used)}`)
			out(` Max: ${formatBytes(statfs.max)}`)
		}
	}

	/**
	 * Execute a `whoami` command
	 */
	private async _whoami(params: CommandParameters) {
		const email = this.filen.config.email ?? ""
		if (params.formatJson) {
			outJson({ email })
		} else {
			out(email)
		}
	}

	/**
	 * Execute a `mv` command
	 */
	private async _mv(params: CommandParameters) {
		try {
			const from = params.cloudWorkingPath.navigate(params.args[0]!)
			const to = await params.cloudWorkingPath.navigateAndAppendFileNameIfNecessary(this.filen, params.args[1]!, from.cloudPath[from.cloudPath.length - 1]!)
			await this.filen.fs().rename({ from: from.toString(), to: to.toString() })
		} catch (e) {
			err("No such file or directory")
		}
	}

	/**
	 * Execute a `cp` command
	 */
	private async _cp(params: CommandParameters) {
		try {
			const from = params.cloudWorkingPath.navigate(params.args[0]!)
			const to = await params.cloudWorkingPath.navigateAndAppendFileNameIfNecessary(this.filen,
				params.args[1]!,
				from.cloudPath[from.cloudPath.length - 1]!
			)
			const fromSize = (await this.filen.fs().stat({ path: from.toString() })).size
			let progressBar = quiet ? null : displayTransferProgressBar("Downloading", from.getLastSegment(), fromSize, true)
			let stillDownloading = true
			const onProgress = quiet
				? doNothing
				: (transferred: number) => {
					progressBar!.onProgress(transferred)
					if (progressBar!.progressBar.getProgress() >= 1 && stillDownloading) {
						stillDownloading = false
						progressBar = displayTransferProgressBar("Uploading", from.getLastSegment(), fromSize, true)
					}
				}
			try {
				const abortSignal = InterruptHandler.instance.createAbortSignal()
				await this.filen.fs().copy({ from: from.toString(), to: to.toString(), onProgress, abortSignal })
			} catch (e) {
				if (progressBar) progressBar.progressBar.stop()
				err("Aborted")
			}
		} catch (e) {
			err("No such file or directory")
		}
	}

	/**
	 * Execute a `write` command (write plain text to a file in the cloud)
	 */
	private async _write(params: CommandParameters) {
		const path = params.cloudWorkingPath.navigate(params.args[0]!)
		const content = params.args.slice(1).join(" ")
		await this.filen.fs().writeFile({ path: path.toString(), content: Buffer.from(content) })
	}

	/**
	 * Execute an `open` or `edit` command (download a file into a temporary location and open it in the associated application)
	 * @param edit If this flag is set and the file was edited, it will be re-uploaded after closing the application
	 */
	private async _openOrEdit(params: CommandParameters, edit: boolean) {
		try {
			const path = params.cloudWorkingPath.navigate(params.args[0]!)
			const downloadPath = pathModule.join(this.filen.config.tmpPath ?? process.cwd(), path.getLastSegment())
			await this.filen.fs().download({ path: path.toString(), destination: downloadPath })
			const hash = !edit ? null : await hashFile(downloadPath)
			await open(downloadPath, { wait: true })
			if (edit && (await hashFile(downloadPath)) !== hash) {
				await this.filen.fs().upload({ path: path.toString(), source: downloadPath })
			}
			setTimeout(() => fsModule.unlinkSync(downloadPath), 500)
		} catch (e) {
			err("No such file")
		}
		return {}
	}

	/**
	 * Execute a `view` command (reveal path in Web Drive)
	 */
	private async _view(params: CommandParameters) {
		try {
			let path = params.args[0] === undefined ? params.cloudWorkingPath : params.cloudWorkingPath.navigate(params.args[0])
			if ((await this.filen.fs().stat({ path: path.toString() })).isFile()) {
				path = path.navigate("..")
			}
			const getUrlSegments = async (path: CloudPath): Promise<string[]> => {
				const uuid = await this.filen.fs().pathToItemUUID({ path: path.toString() })
				if (path.cloudPath.length > 0) return [ ...await getUrlSegments(path.navigate("..")), uuid!.toString() ]
				else return [ uuid!.toString() ]
			}
			const urlSegments = await getUrlSegments(path)
			const url = `https://drive.filen.io/#/${urlSegments.join("/")}`
			if (!quiet) {
				if (params.formatJson) outJson({ url })
				else out(url)
			}
			await open(url, { wait: true })
		} catch (e) {
			err("No such file or directory")
		}
	}

	/**
	 * Execute a `favorites` or `recents` command (display all favorites or recents)
	 */
	private async _favoritesOrRecents(params: CommandParameters, command: "favorites" | "recents") {
		const items = command === "favorites"
			? await this.filen.cloud().listFavorites()
			: await this.filen.cloud().listRecents()
		if (params.formatJson) {
			outJson((await getItemPaths(this.filen, items)).map(item => {
				return { path: item.path }
		 	}))
		} else {
			out((await getItemPaths(this.filen, items)).map(item => item.path).join("\n"))
		}
	}

	/**
	 * Execute a `favorite` or `unfavorite` command (toggle the favorited status of an item)
	 */
	private async _favoriteOrUnfavorite(params: CommandParameters, command: "favorite" | "unfavorite") {
		try {
			const path = params.cloudWorkingPath.navigate(params.args[0]!)
			const item = await this.filen.fs().stat({ path: path.toString() })
			if (item.type === "file") {
				await this.filen.cloud().favoriteFile({ uuid: item.uuid, favorite: command === "favorite" })
			} else {
				await this.filen.cloud().favoriteDirectory({ uuid: item.uuid, favorite: command === "favorite" })
			}
			if (verbose) out(`${path.toString()} ${command}d.`)
		} catch (e) {
			err("No such file or directory")
		}
	}
}
