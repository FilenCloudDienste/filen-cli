import { err, out, outJson, prompt } from "./interface"
import FilenSDK from "@filen/sdk"
import pathModule from "path"
import { doNothing, formatBytes, formatTimestamp, hashFile } from "./util"
import { CloudPath } from "./cloudPath"
import cliProgress from "cli-progress"
import * as fsModule from "node:fs"
import { InterruptHandler } from "./interrupt"
import open from "open"

type CommandParameters = {
	cloudWorkingPath: CloudPath,
	args: string[],
	formatJson: boolean,
	quiet: boolean
}

/**
 * Handles CLI commands related to cloud filesystem operations.
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
	 * @param quiet Whether to hide things like progress bars
	 * @returns Whether to exit the interactive environment, and where to navigate (via `cd` command)
	 */
	public async executeCommand(cloudWorkingPath: CloudPath, cmd: string, args: string[], formatJson: boolean, quiet: boolean): Promise<{
		exit?: boolean,
		cloudWorkingPath?: CloudPath
	}> {
		const params = { cloudWorkingPath, args, formatJson, quiet }

		if (["cd", "navigate"].includes(cmd)) {
			const cloudWorkingPath = await this._cd(params)
			return { cloudWorkingPath }
		}

		if (["ls", "list"].includes(cmd)) {
			await this._ls(params)
			return {}
		}

		if (["more", "read"].includes(cmd)) {
			await this._more(params)
			return {}
		}

		if (["mkdir"].includes(cmd)) {
			await this._mkdir(params)
			return {}
		}

		if (["rm", "rmdir", "remove", "del", "delete"].includes(cmd)) {
			await this._rm(params)
			return {}
		}

		if (["upload"].includes(cmd)) {
			await this._upload(params)
			return {}
		}

		if (["download"].includes(cmd)) {
			await this._download(params)
			return {}
		}

		if (["stat", "stats"].includes(cmd)) {
			await this._stat(params)
			return {}
		}

		if (["mv", "move", "rename"].includes(cmd)) {
			await this._mv(params)
			return {}
		}

		if (["cp", "copy"].includes(cmd)) {
			await this._cp(params)
			return {}
		}

		if (["write"].includes(cmd)) {
			await this._write(params)
			return {}
		}

		if (["open"].includes(cmd)) {
			await this._openOrEdit(params, false)
			return {}
		}
		if (["edit"].includes(cmd)) {
			await this._openOrEdit(params, true)
			return {}
		}

		if (cmd === "exit") return { exit: true }

		err(`Unknown command: ${cmd}`)
		return {}
	}

	/**
	 * Execute a `cd` command
	 * @return the CloudPath navigated to, if successful
	 */
	private async _cd(params: CommandParameters) {
		if (params.args.length < 1) {
			err("Need to provide arg 1: directory")
			return
		}
		const path = params.cloudWorkingPath.navigate(params.args[0])
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
		const path = params.args.length > 0 ? params.cloudWorkingPath.navigate(params.args[0]) : params.cloudWorkingPath
		try {
			const output = await this.filen.fs().readdir({ path: path.toString() })
			if (params.formatJson) outJson(output)
			else out(output.join("  "))
		} catch (e) {
			err("No such directory")
		}
	}

	/**
	 * Execute a `more` command
	 */
	private async _more(params: CommandParameters) {
		if (params.args.length < 1) {
			err("Need to provide arg 1: file")
			return
		}
		const path = params.cloudWorkingPath.navigate(params.args[0])
		try {
			const fileSize = (await this.filen.fs().stat({ path: path.toString() })).size
			if (fileSize > 2_000) {
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
	 * Execute an `mkdir` command
	 */
	private async _mkdir(params: CommandParameters) {
		if (params.args.length < 1) {
			err("Need to provide arg 1: directory name")
			return
		}
		await this.filen.fs().mkdir({ path: params.cloudWorkingPath.navigate(params.args[0]).toString() })
	}

	/**
	 * Execute a `rm` command
	 */
	private async _rm(params: CommandParameters) {
		if (params.args.length < 1) {
			err("Need to provide arg 1: path")
			return
		}
		try {
			await this.filen.fs().rm({ path: params.cloudWorkingPath.navigate(params.args[0]).toString() })
		} catch (e) {
			err("No such file or directory")
		}
	}

	/**
	 * Execute an `upload` command (upload a local file into the cloud)
	 */
	private async _upload(params: CommandParameters) {
		if (params.args.length < 2) {
			if (params.args.length < 1) err("Need to provide arg 1: local file")
			else err("Need to provide arg 2: cloud path")
			return {}
		}
		const source = params.args[0]
		const size = fsModule.statSync(source).size
		const path = await params.cloudWorkingPath.navigateAndAppendFileNameIfNecessary(params.args[1], source.split(/[/\\]/)[source.split(/[/\\]/).length - 1])
		const progressBar = params.quiet ? null : this.displayTransferProgressBar("Uploading", path.getLastSegment(), size)
		try {
			const abortSignal = InterruptHandler.instance.createAbortSignal()
			await this.filen.fs().upload({
				path: path.toString(),
				source,
				onProgress: params.quiet ? doNothing : progressBar!.onProgress,
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
		if (params.args.length < 1) {
			err("Need to provide arg 1: cloud file")
			return
		}
		const source = params.cloudWorkingPath.navigate(params.args[0])
		const rawPath = params.args[1] === undefined || params.args[1] === "." ? process.cwd() + "/" : params.args[1]
		const path = rawPath.endsWith("/") || rawPath.endsWith("\\") ? pathModule.join(rawPath, source.cloudPath[source.cloudPath.length - 1]) : rawPath
		try {
			const size = (await this.filen.fs().stat({ path: source.toString() })).size
			const progressBar = params.quiet ? null : this.displayTransferProgressBar("Downloading", source.getLastSegment(), size)
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
		if (params.args.length < 1) {
			err("Need to provide arg 1: path")
			return
		}
		const path = params.cloudWorkingPath.navigate(params.args[0])
		try {
			const stat = await this.filen.fs().stat({ path: path.toString() })
			const size = stat.isFile() ? stat.size : await this.filen.cloud().directorySize({ uuid: stat.uuid })

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
	 * Execute a `mv` command
	 */
	private async _mv(params: CommandParameters) {
		if (params.args.length < 2) {
			if (params.args.length < 1) err("Need to provide arg 1: path from")
			else err("Need to provide arg 2: path to")
			return
		}
		try {
			const from = params.cloudWorkingPath.navigate(params.args[0])
			const to = await params.cloudWorkingPath.navigateAndAppendFileNameIfNecessary(params.args[1], from.cloudPath[from.cloudPath.length - 1])
			await this.filen.fs().rename({ from: from.toString(), to: to.toString() })
		} catch (e) {
			err("No such file or directory")
		}
	}

	/**
	 * Execute a `cp` command
	 */
	private async _cp(params: CommandParameters) {
		if (params.args.length < 2) {
			if (params.args.length < 1) err("Need to provide arg 1: path from")
			else err("Need to provide arg 2: path to")
			return
		}
		try {
			const from = params.cloudWorkingPath.navigate(params.args[0])
			const to = await params.cloudWorkingPath.navigateAndAppendFileNameIfNecessary(params.args[1], from.cloudPath[from.cloudPath.length - 1])
			const fromSize = (await this.filen.fs().stat({ path: from.toString() })).size
			let progressBar = params.quiet ? null : this.displayTransferProgressBar("Downloading", from.getLastSegment(), fromSize, true)
			let stillDownloading = true
			const onProgress = params.quiet ? doNothing : (transferred: number) => {
				progressBar!.onProgress(transferred)
				if (progressBar!.progressBar.getProgress() >= 1 && stillDownloading) {
					stillDownloading = false
					progressBar = this.displayTransferProgressBar("Uploading", from.getLastSegment(), fromSize, true)
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
		if (params.args.length < 1) {
			err("Need to provide arg 1: file")
			return
		}
		const path = params.cloudWorkingPath.navigate(params.args[0])
		const content = params.args.slice(1).join(" ")
		await this.filen.fs().writeFile({ path: path.toString(), content: Buffer.from(content) })
	}

	/**
	 * Execute an `open` or `edit` command (download a file into a temporary location and open it in the associated application)
	 * @param edit If this flag is set and the file was edited, it will be re-uploaded after closing the application
	 */
	private async _openOrEdit(params: CommandParameters, edit: boolean) {
		if (params.args.length < 1) {
			err("Need to provide arg 1: file")
			return {}
		}
		try {
			const path = params.cloudWorkingPath.navigate(params.args[0])
			const downloadPath = pathModule.join(this.filen.config.tmpPath ?? process.cwd(), path.getLastSegment())
			await this.filen.fs().download({ path: path.toString(), destination: downloadPath })
			const hash = !edit ? null : await hashFile(downloadPath)
			await open(downloadPath, { wait: edit })
			if (edit && await hashFile(downloadPath) !== hash) {
				await this.filen.fs().upload({ path: path.toString(), source: downloadPath })
			}
			fsModule.unlinkSync(downloadPath)
		} catch (e) {
			err("No such file")
		}
		return {}
	}

	// ---

	/**
	 * Display a progress bar for a file transfer.
	 * @param action The action (like "Downloading", "Uploading")
	 * @param file The file's name
	 * @param total Total size of the file (in bytes)
	 * @param isApproximate Whether to display an approximate symbol "~" before the current total
	 */
	private displayTransferProgressBar(action: string, file: string, total: number, isApproximate: boolean = false): {
		progressBar: cliProgress.SingleBar,
		onProgress: (transferred: number) => void
	} {
		const progressBar = new cliProgress.SingleBar({
			format: `${action} ${file} [{bar}] {percentage}% | ETA: {eta_formatted} | ${isApproximate ? "~ " : ""}{value} / {total}`,
			// of a number is <= 100, it is likely a percentage; otherwise format as byte (library used here doesn't provide other options)
			formatValue: n => n <= 100 ? n.toString() : formatBytes(n)
		}, cliProgress.Presets.legacy)
		progressBar.start(total, 0)
		const onProgress = (transferred: number) => {
			progressBar.increment(transferred)
			if (progressBar.getProgress() >= 1.0) progressBar.stop()
		}
		return { progressBar, onProgress }
	}
}
