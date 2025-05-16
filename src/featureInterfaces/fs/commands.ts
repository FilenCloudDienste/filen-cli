export type Command = {
	cmd: string
	aliases: string[]
	arguments: Argument[]
}

export type Argument = {
	name: string
	type: ArgumentType
	optional?: boolean
}

export enum ArgumentType {
	cloudDirectory,
	cloudFile,
	cloudPath,
	localFile,
	localPath,
	any,
}

export function argumentTypeIsFileSystem(argumentType: ArgumentType): boolean {
	return argumentType !== ArgumentType.any
}

export function argumentTypeIsCloud(argumentType: ArgumentType): boolean {
	return argumentType === ArgumentType.cloudDirectory || argumentType === ArgumentType.cloudFile || argumentType === ArgumentType.cloudPath
}

export function argumentTypeAcceptsFile(argumentType: ArgumentType): boolean {
	return argumentType === ArgumentType.localFile || argumentType === ArgumentType.localPath || argumentType === ArgumentType.cloudFile || argumentType === ArgumentType.cloudPath
}

/**
 * All available filesystem commands.
 */
export const fsCommands: Command[] = [
	{
		cmd: "cd",
		aliases: ["navigate"],
		arguments: [{ name: "directory", type: ArgumentType.cloudDirectory }]
	},
	{
		cmd: "ls",
		aliases: ["list"],
		arguments: [{ name: "directory", type: ArgumentType.cloudDirectory, optional: true }]
	},
	{
		cmd: "cat",
		aliases: ["more", "read"],
		arguments: [{ name: "file", type: ArgumentType.cloudFile }]
	},
	{
		cmd: "head",
		aliases: [],
		arguments: [{ name: "file", type: ArgumentType.cloudFile }]
	},
	{
		cmd: "tail",
		aliases: [],
		arguments: [{ name: "file", type: ArgumentType.cloudFile }]
	},
	{
		cmd: "mkdir",
		aliases: [],
		arguments: [{ name: "directory name", type: ArgumentType.cloudDirectory }]
	},
	{
		cmd: "rm",
		aliases: ["rmdir", "remove", "del", "delete"],
		arguments: [{ name: "file or directory", type: ArgumentType.cloudPath }]
	},
	{
		cmd: "upload",
		aliases: [],
		arguments: [
			{ name: "local file or directory", type: ArgumentType.localPath },
			{ name: "cloud path", type: ArgumentType.cloudPath }
		]
	},
	{
		cmd: "download",
		aliases: [],
		arguments: [
			{ name: "cloud file", type: ArgumentType.cloudFile },
			{ name: "local file or directory", type: ArgumentType.localPath, optional: true }
		]
	},
	{
		cmd: "stat",
		aliases: ["stats"],
		arguments: [{ name: "file or directory", type: ArgumentType.cloudPath }]
	},
	{
		cmd: "statfs",
		aliases: [],
		arguments: []
	},
	{
		cmd: "whoami",
		aliases: [],
		arguments: []
	},
	{
		cmd: "mv",
		aliases: ["move", "rename"],
		arguments: [
			{ name: "file or directory", type: ArgumentType.cloudPath },
			{ name: "destination file or directory", type: ArgumentType.cloudPath }
		]
	},
	{
		cmd: "cp",
		aliases: ["copy"],
		arguments: [
			{ name: "file or directory", type: ArgumentType.cloudPath },
			{ name: "destination file or directory", type: ArgumentType.cloudPath }
		]
	},
	{
		cmd: "write",
		aliases: ["touch"],
		arguments: [
			{ name: "file", type: ArgumentType.cloudFile },
			{ name: "content", type: ArgumentType.any }
		]
	},
	{
		cmd: "open",
		aliases: [],
		arguments: [{ name: "file", type: ArgumentType.cloudFile }]
	},
	{
		cmd: "edit",
		aliases: [],
		arguments: [{ name: "file", type: ArgumentType.cloudFile }]
	},
	{
		cmd: "view",
		aliases: ["reveal", "drive"],
		arguments: [{ name: "path", type: ArgumentType.cloudPath, optional: true }]
	},
	{
		cmd: "favorites",
		aliases: ["favorited"],
		arguments: []
	},
	{
		cmd: "favorite",
		aliases: [],
		arguments: [{ name: "path", type: ArgumentType.cloudPath, optional: true }]
	},
	{
		cmd: "unfavorite",
		aliases: [],
		arguments: [{ name: "path", type: ArgumentType.cloudPath, optional: true }]
	},
	{
		cmd: "recents",
		aliases: ["recent"],
		arguments: []
	},
]

/**
 * All available non-filesystem commands, for interactive mode unknown command handling.
 */
export const nonInteractiveCommands = ["version", "canary", "install", "logout", "export-auth-config", "export-api-key", "webdav", "webdav-proxy", "s3", "sync", "trash", "link", "links", "mount", "export-notes"]

/**
 * Splits a command input into segments, while respecting quotes.
 * Example: `'cd "folder name"'` returns `['cd', '"folder name"']`.
 */
export function splitCommandSegments(input: string): string[] {
	const segments: string[] = []
	let buffer = ""
	let insideQuotes = false
	input.split("").forEach(c => {
		if (c === "\"") insideQuotes = !insideQuotes
		if (c === " " && !insideQuotes) {
			segments.push(buffer)
			buffer = ""
		} else {
			buffer += c
		}
	})
	if (buffer.length > 0) segments.push(buffer)
	return segments
}