import { err, out, outJson, prompt } from "./interface"
import FilenSDK from "@filen/sdk"
import pathModule from "path"
import { doNothing, formatTimestamp, hashFile } from "./util"
import { CloudPath } from "./cloudPath"
import cliProgress from "cli-progress"
import * as fsModule from "node:fs"
import { InterruptHandler } from "./interrupt"
import open from "open"

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
		if (["cd", "navigate"].includes(cmd)) {

			if (args.length < 1) {
				err("Need to provide arg 1: directory")
				return {}
			}
			const path = cloudWorkingPath.navigate(args[0])
			try {
				const directory = await this.filen.fs().stat({ path: path.toString() })
				if (!directory.isDirectory()) err("Not a directory")
				else return { cloudWorkingPath: path }
			} catch (e) {
				err("No such directory")
			}
			return {}

		}
		if (["ls", "list"].includes(cmd)) {

			const path = args.length > 0 ? cloudWorkingPath.navigate(args[0]) : cloudWorkingPath
			const output = await this.filen.fs().readdir({ path: path.toString() })
			if (formatJson) outJson(output)
			else out(output.join("  "))
			return {}

		}
		if (["more", "read"].includes(cmd)) {

			if (args.length < 1) {
				err("Need to provide arg 1: file")
				return {}
			}
			const path = cloudWorkingPath.navigate(args[0])
			try {
				const fileSize = (await this.filen.fs().stat({ path: path.toString() })).size
				if (fileSize > 2_000) {
					const result = await prompt(`This file is ${fileSize}B large. Continue? [y/N] `)
					if (result.toLowerCase() !== "y") return {}
				}
				const content = (await this.filen.fs().readFile({ path: path.toString() })).toString()
				if (formatJson) outJson({ text: content })
				else out(content)
			} catch (e) {
				err("No such file")
			}
			return {}

		}
		if (["mkdir"].includes(cmd)) {

			if (args.length < 1) {
				err("Need to provide arg 1: directory name")
				return {}
			}
			await this.filen.fs().mkdir({ path: cloudWorkingPath.navigate(args[0]).toString() })
			return {}

		}
		if (["rm", "rmdir", "remove", "del", "delete"].includes(cmd)) {

			if (args.length < 1) {
				err("Need to provide arg 1: path")
				return {}
			}
			try {
				await this.filen.fs().rm({ path: cloudWorkingPath.navigate(args[0]).toString() })
			} catch (e) {
				err("No such file or directory")
			}
			return {}

		}
		if (["upload"].includes(cmd)) {

			if (args.length < 2) {
				if (args.length < 1) err("Need to provide arg 1: local file")
				else err("Need to provide arg 2: cloud path")
				return {}
			}
			const source = args[0]
			const size = fsModule.statSync(source).size
			const path = await cloudWorkingPath.navigateAndAppendFileNameIfNecessary(args[1], source.split(/[/\\]/)[source.split(/[/\\]/).length - 1])
			const onProgress = quiet ? doNothing : this.displayTransferProgressBar("Uploading", path.getLastSegment(), size).onProgress
			const abortSignal = InterruptHandler.instance.createAbortSignal()
			await this.filen.fs().upload({ path: path.toString(), source, onProgress, abortSignal })
			return {}

		}
		if (["download"].includes(cmd)) {

			if (args.length < 1) {
				err("Need to provide arg 1: cloud file")
				return {}
			}
			const source = cloudWorkingPath.navigate(args[0])
			const rawPath = args[1] === undefined || args[1] === "." ? process.cwd() + "/" : args[1]
			const path = rawPath.endsWith("/") || rawPath.endsWith("\\") ? pathModule.join(rawPath, source.cloudPath[source.cloudPath.length - 1]) : rawPath
			const size = (await this.filen.fs().stat({ path: source.toString() })).size
			const onProgress = quiet ? doNothing : this.displayTransferProgressBar("Downloading", source.getLastSegment(), size).onProgress
			const abortSignal = InterruptHandler.instance.createAbortSignal()
			await this.filen.fs().download({ path: source.toString(), destination: path, onProgress, abortSignal })
			return {}

		}
		if (["stat", "stats"].includes(cmd)) {

			if (args.length < 1) {
				err("Need to provide arg 1: path")
				return {}
			}
			const path = cloudWorkingPath.navigate(args[0])
			const stat = await this.filen.fs().stat({ path: path.toString() })

			let size = stat.size
			if (!stat.isFile()) size = await this.filen.cloud().directorySize({ uuid: stat.uuid })

			if (formatJson) {
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
				out(`  Size: ${size}`)
				out(`Modify: ${formatTimestamp(stat.mtimeMs)}`)
				out(` Birth: ${formatTimestamp(stat.birthtimeMs)}`)
			}
			return {}

		}
		if (["mv", "move", "rename"].includes(cmd)) {
			if (args.length < 2) {
				if (args.length < 1) err("Need to provide arg 1: path from")
				else err("Need to provide arg 2: path to")
				return {}
			}
			try {
				const from = cloudWorkingPath.navigate(args[0])
				const to = await cloudWorkingPath.navigateAndAppendFileNameIfNecessary(args[1], from.cloudPath[from.cloudPath.length - 1])
				await this.filen.fs().rename({ from: from.toString(), to: to.toString() })
			} catch (e) {
				err("No such file or directory")
			}
			return {}
		}
		if (["cp", "copy"].includes(cmd)) {
			if (args.length < 2) {
				if (args.length < 1) err("Need to provide arg 1: path from")
				else err("Need to provide arg 2: path to")
				return {}
			}
			try {
				const from = cloudWorkingPath.navigate(args[0])
				const to = await cloudWorkingPath.navigateAndAppendFileNameIfNecessary(args[1], from.cloudPath[from.cloudPath.length - 1])
				const fromSize = (await this.filen.fs().stat({ path: from.toString() })).size
				let progressBar = quiet ? null : this.displayTransferProgressBar("Downloading", from.getLastSegment(), fromSize, true)
				let stillDownloading = true
				const onProgress = quiet ? doNothing : (transferred: number) => {
					progressBar!.onProgress(transferred)
					//if (progressBar!.progressBar.getProgress() > 0.9) console.log(progressBar!.progressBar.getProgress())
					if (progressBar!.progressBar.getProgress() >= 1 && stillDownloading) {
						stillDownloading = false
						progressBar = this.displayTransferProgressBar("Uploading", from.getLastSegment(), fromSize, true)
					}
				}
				const abortSignal = InterruptHandler.instance.createAbortSignal()
				await this.filen.fs().copy({ from: from.toString(), to: to.toString(), onProgress, abortSignal })
			} catch (e) {
				err("No such file or directory")
			}
			return {}
		}

		// write text into a file
		if (["write"].includes(cmd)) {

			if (args.length < 1) {
				err("Need to provide arg 1: file")
				return {}
			}
			const path = cloudWorkingPath.navigate(args[0])
			const content = args.slice(1).join(" ")
			await this.filen.fs().writeFile({ path: path.toString(), content: Buffer.from(content) })
			return {}

		}

		// download a file into a temporary location and open it in the associated app
		const openOrEdit = async (args: string[], edit: boolean) => {
			if (args.length < 1) {
				err("Need to provide arg 1: file")
				return {}
			}
			const path = cloudWorkingPath.navigate(args[0])
			const downloadPath = pathModule.join(this.filen.config.tmpPath ?? process.cwd(), path.getLastSegment())
			await this.filen.fs().download({ path: path.toString(), destination: downloadPath })
			const hash = !edit ? null : await hashFile(downloadPath)
			await open(downloadPath, { wait: edit })
			if (edit && await hashFile(downloadPath) !== hash) {
				await this.filen.fs().upload({ path: path.toString(), source: downloadPath })
			}
			fsModule.unlinkSync(downloadPath)
			return {}
		}
		if (["open"].includes(cmd)) {
			await openOrEdit(args, false)
			return {}
		}
		if (["edit"].includes(cmd)) {
			await openOrEdit(args, true)
			return {}
		}

		if (cmd === "exit") return { exit: true }

		err(`Unknown command: ${cmd}`)
		return {}
	}

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
			format: `${action} ${file} [{bar}] {percentage}% | ETA: {eta}s | ${isApproximate ? "~ " : ""}{value} B / {total} B`
		}, cliProgress.Presets.legacy)
		progressBar.start(total, 0, { speed: "N/A" })
		const onProgress = (transferred: number) => {
			progressBar.increment(transferred)
			if (progressBar.getProgress() >= 1.0) progressBar.stop()
		}
		return { progressBar, onProgress }
	}
}
