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
	if (["mv", "move", "rename"].includes(cmd)) {
		
		if (args.length < 2) {
			if (args.length < 1) err("Need to provide arg 1: path from")
			else err("Need to provide arg 2: path to")
			return {}
		}
		try {
			const from = navigateCloudPath(cloudWorkingPath, args[0])
			const to = navigateCloudPath(cloudWorkingPath, args[1])
			if ((await filen.fs().stat({path: resolveCloudPath(to)})).isDirectory()) to.push(from[from.length-1])
			await filen.fs().rename({from: resolveCloudPath(from), to: resolveCloudPath(to)})
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
		const path = navigateCloudPath(cloudWorkingPath, args[1])

		let appendFileName = false
		try {
			appendFileName = (await filen.fs().stat({path: resolveCloudPath(path)})).isDirectory()
		} catch (e) {
			appendFileName = true
		}
		if (appendFileName) path.push(source.split(/[\/\\]/)[source.split(/[\/\\]/).length-1])

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

	if (cmd == "exit") return {exit: true}

	err(`Unknown command: ${cmd}`)
	return {}
}