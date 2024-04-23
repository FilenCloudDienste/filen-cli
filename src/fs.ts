import { err, out, outJson } from "./interface"
import FilenSDK from "@filen/sdk"
import pathModule from "path"
import { formatTimestamp } from "./util"
import { CloudPath } from "./cloudPath"

/**
 * Handles CLI commands related to cloud filesystem operations.
 */
export class FS {
	public constructor(private readonly filen: FilenSDK) {
	}

	/**
	 * Executes a filesystem command.
	 * @param cloudWorkingPath Where the command is executed (in a stateless environment, this is [])
	 * @param cmd
	 * @param args
	 * @param formatJson Whether to format the output as JSON.
	 * @returns Whether to exit the interactive environment, and where to navigate (via `cd` command)
	 */
	public async executeCommand(cloudWorkingPath: CloudPath, cmd: string, args: string[], formatJson: boolean): Promise<{
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
			const path = await cloudWorkingPath.navigateAndAppendFileNameIfNecessary(args[1], source.split(/[/\\]/)[source.split(/[/\\]/).length - 1])

			await this.filen.fs().upload({ path: path.toString(), source })
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
			await this.filen.fs().download({ path: source.toString(), destination: path })
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
			if (!stat.isFile()) {
				const files = await this.filen.fs().readdir({ path: path.toString(), recursive: true })
				//TODO could be parallelized
				for (const file of files) {
					if (file === "") continue
					const fileStat = await this.filen.fs().stat({ path: path + "/" + file })
					size += fileStat.size
				}
			}

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

		const moveOrCopy = async (args: string[], copy: boolean) => {
			if (args.length < 2) {
				if (args.length < 1) err("Need to provide arg 1: path from")
				else err("Need to provide arg 2: path to")
				return {}
			}
			try {
				const from = cloudWorkingPath.navigate(args[0])
				const to = await cloudWorkingPath.navigateAndAppendFileNameIfNecessary(args[1], from.cloudPath[from.cloudPath.length - 1])
				const parameters = { from: from.toString(), to: to.toString() }
				await (copy ? this.filen.fs().copy(parameters) : this.filen.fs().rename(parameters))
			} catch (e) {
				err("No such file or directory")
			}
		}
		if (["mv", "move", "rename"].includes(cmd)) {
			await moveOrCopy(args, false)
			return {}
		}
		if (["cp", "copy"].includes(cmd)) {
			await moveOrCopy(args, true)
			return {}
		}

		// not a UNIX command; write text into a file
		if (["write"].includes(cmd)) {

			if (args.length < 1) {
				err("Need to provide arg 1: file")
				return {}
			}
			const path = cloudWorkingPath.navigate(args[0])
			const content = args.slice(1).join(" ")
			await this.filen.fs().writeFile({ path: path.toString(), content: Buffer.from(content) })
			return {}
			//TODO bug: opens WordPad somehow

		}

		if (cmd === "exit") return { exit: true }

		err(`Unknown command: ${cmd}`)
		return {}
	}
}
