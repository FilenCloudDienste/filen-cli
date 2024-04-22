import { err, out } from "./interface"
import FilenSDK from "@filen/sdk"

export function navigateCloudPath(cloudWorkingPath: string[], path: string) {
	if (path.startsWith("/")) return path.substring(1).split("/")
	else return [...cloudWorkingPath, path]
}
export function resolveCloudPath(cloudWorkingPath: string[]) {
	return "/" + cloudWorkingPath.join("/")
}

export type CommandExecutionResult = {
	exit?: boolean,
	cloudWorkingPath?: string[],
}

export async function executeCommand(filen: FilenSDK, cloudWorkingPath: string[], cmd: string, args: string[]): Promise<CommandExecutionResult> {
	if (cmd == "cd") {

		if (args.length < 1) {
			err("Need to provide arg 0: directory")
			return {}
		}
		let path = navigateCloudPath(cloudWorkingPath, args[0])
		try {
			const directory = await filen.fs().stat({path: resolveCloudPath(path)})
			if (!directory.isDirectory()) err("Not a directory")
			return {cloudWorkingPath: path}
		} catch (e) {
			err("No such directory")
			return {}
		}

	}
	if (cmd == "ls") {

		const output = await filen.fs().readdir({path: resolveCloudPath(cloudWorkingPath)})
		out(output.join("   "))
		return {}

	}
	if (cmd == "more") {

		if (args.length < 1) {
			err("Need to provide arg 0: file")
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
	if (cmd == "mkdir") {

		if (args.length < 1) {
			err("Need to provide arg 0: directory name")
			return {}
		}
		await filen.fs().mkdir({path: resolveCloudPath(navigateCloudPath(cloudWorkingPath, args[0]))})
		return {}

	}
	if (cmd == "rm") {

		if (args.length < 1) {
			err("Need to provide arg 0: name")
			return {}
		}
		try {
			await filen.fs().rm({path: resolveCloudPath(navigateCloudPath(cloudWorkingPath, args[0]))})
		} catch (e) {
			err("No such file or directory")
		}
		return {}

	}

	if (cmd == "exit") return {exit: true}

	err(`Unknown command: ${cmd}`)
	return {}
}