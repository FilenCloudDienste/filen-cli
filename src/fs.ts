import { err, out } from "./interface"
import FilenSDK from "@filen/sdk"
import pathModule from "path"

export function navigateCloudPath(cloudWorkingPath: string[], path: string) {
	if (path.startsWith("/")) return path.substring(1).split("/")
	else {
		let cwp = [...cloudWorkingPath]
		for (const segment of path.split("/")) {
			if (segment.length == 0) continue
			if (segment == ".") continue
			if (segment == "..") cwp = cwp.slice(0, cwp.length - 1)
			else cwp = [...cwp, segment]
		}
		return cwp
	}
}
async function cloudPathNavigateAndAppendFileNameIfNecessary(filen: FilenSDK, cloudWorkingPath: string[], path: string, fileName: string) {
	let appendFileName = false
	const cloudPath = navigateCloudPath(cloudWorkingPath, path)
	if (path.endsWith("/")) appendFileName = true
	else {
		try {
			appendFileName = (await filen.fs().stat({path: resolveCloudPath(cloudPath)})).isDirectory()
		} catch (e) {}
	}
	return appendFileName ? [...cloudPath, fileName] : cloudPath
}
export function resolveCloudPath(cloudWorkingPath: string[]) {
	return "/" + cloudWorkingPath.join("/")
}

export type CommandExecutionResult = {
	exit?: boolean,
	cloudWorkingPath?: string[],
}

export async function executeCommand(filen: FilenSDK, cloudWorkingPath: string[], cmd: string, args: string[]): Promise<CommandExecutionResult> {
	if (["cd", "navigate"].includes(cmd)) {

		if (args.length < 1) {
			err("Need to provide arg 1: directory")
			return {}
		}
		let path = navigateCloudPath(cloudWorkingPath, args[0])
		try {
			const directory = await filen.fs().stat({path: resolveCloudPath(path)})
			if (!directory.isDirectory()) err("Not a directory")
			else return {cloudWorkingPath: path}
		} catch (e) {
			err("No such directory")
		}
		return {}

	}
	if (["ls", "list"].includes(cmd)) {

		const path = args.length > 0 ? navigateCloudPath(cloudWorkingPath, args[0]) : cloudWorkingPath
		const output = await filen.fs().readdir({path: resolveCloudPath(path)})
		out(output.join("  "))
		return {}

	}
	if (["more", "read"].includes(cmd)) {

		if (args.length < 1) {
			err("Need to provide arg 1: file")
			return {}
		}
		const path = navigateCloudPath(cloudWorkingPath, args[0])
		try {
			out((await filen.fs().readFile({path: resolveCloudPath(path)})).toString())
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
		await filen.fs().mkdir({path: resolveCloudPath(navigateCloudPath(cloudWorkingPath, args[0]))})
		return {}

	}
	if (["rm", "rmdir", "remove", "del", "delete"].includes(cmd)) {

		if (args.length < 1) {
			err("Need to provide arg 1: path")
			return {}
		}
		try {
			await filen.fs().rm({path: resolveCloudPath(navigateCloudPath(cloudWorkingPath, args[0]))})
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
		const path = await cloudPathNavigateAndAppendFileNameIfNecessary(filen,
			cloudWorkingPath, args[1],
			source.split(/[\/\\]/)[source.split(/[\/\\]/).length-1]
		)

		await filen.fs().upload({path: resolveCloudPath(path), source})
		return {}

	}
	if (["download"].includes(cmd)) {

		if (args.length < 1) {
			err("Need to provide arg 1: cloud file")
			return {}
		}
		const source = navigateCloudPath(cloudWorkingPath, args[0])
		const rawPath = args[1] == undefined || args[1] == "." ? process.cwd() + "/" : args[1]
		const path = rawPath.endsWith("/") || rawPath.endsWith("\\") ? pathModule.join(rawPath, source[source.length-1]) : rawPath
		await filen.fs().download({path: resolveCloudPath(source), destination: path})
		return {}

	}

	const moveOrCopy = async (args: string[], copy: boolean) => {
		if (args.length < 2) {
			if (args.length < 1) err("Need to provide arg 1: path from")
			else err("Need to provide arg 2: path to")
			return {}
		}
		try {
			const from = navigateCloudPath(cloudWorkingPath, args[0])
			const to = await cloudPathNavigateAndAppendFileNameIfNecessary(filen, cloudWorkingPath, args[1], from[from.length-1])
			console.log(args[1])
			console.log(navigateCloudPath(cloudWorkingPath, args[1]))
			console.log(to)
			const parameters = {from: resolveCloudPath(from), to: resolveCloudPath(to)}
			await (copy ? filen.fs().copy(parameters) : filen.fs().rename(parameters))
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
		const path = navigateCloudPath(cloudWorkingPath, args[0])
		const content = args.slice(1).join(" ")
		await filen.fs().writeFile({path: resolveCloudPath(path), content: Buffer.from(content)})
		return {}

	}

	if (cmd == "exit") return {exit: true}

	err(`Unknown command: ${cmd}`)
	return {}
}