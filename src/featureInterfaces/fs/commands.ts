export type Command = {
	cmd: string
	aliases: string[]
	arguments: CommandArgument[]
}

export type CommandArgument = {
	name: string
	type: "cloud_directory" | "cloud_file" | "cloud_path" | "local_file" | "local_path" | "text"
	optional?: boolean
}

/**
 * All available filesystem commands.
 */
export const fsCommands: Command[] = [
	{
		cmd: "cd",
		aliases: ["navigate"],
		arguments: [{ name: "directory", type: "cloud_directory" }]
	},
	{
		cmd: "ls",
		aliases: ["list"],
		arguments: [{ name: "directory", type: "cloud_directory", optional: true }]
	},
	{
		cmd: "cat",
		aliases: ["more", "read"],
		arguments: [{ name: "file", type: "cloud_file" }]
	},
	{
		cmd: "head",
		aliases: [],
		arguments: [{ name: "file", type: "cloud_file" }]
	},
	{
		cmd: "tail",
		aliases: [],
		arguments: [{ name: "file", type: "cloud_file" }]
	},
	{
		cmd: "mkdir",
		aliases: [],
		arguments: [{ name: "directory name", type: "cloud_directory" }]
	},
	{
		cmd: "rm",
		aliases: ["rmdir", "remove", "del", "delete"],
		arguments: [{ name: "file or directory", type: "cloud_path" }]
	},
	{
		cmd: "upload",
		aliases: [],
		arguments: [
			{ name: "local file or directory", type: "local_path" },
			{ name: "cloud path", type: "cloud_path" }
		]
	},
	{
		cmd: "download",
		aliases: [],
		arguments: [
			{ name: "cloud file", type: "cloud_file" },
			{ name: "local file or directory", type: "local_path", optional: true }
		]
	},
	{
		cmd: "stat",
		aliases: ["stats"],
		arguments: [{ name: "file or directory", type: "cloud_path" }]
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
			{ name: "file or directory", type: "cloud_path" },
			{ name: "destination file or directory", type: "cloud_path" }
		]
	},
	{
		cmd: "cp",
		aliases: ["copy"],
		arguments: [
			{ name: "file or directory", type: "cloud_path" },
			{ name: "destination file or directory", type: "cloud_path" }
		]
	},
	{
		cmd: "write",
		aliases: ["touch"],
		arguments: [
			{ name: "file", type: "cloud_file" },
			{ name: "content", type: "text" }
		]
	},
	{
		cmd: "open",
		aliases: [],
		arguments: [{ name: "file", type: "cloud_file" }]
	},
	{
		cmd: "edit",
		aliases: [],
		arguments: [{ name: "file", type: "cloud_file" }]
	},
	{
		cmd: "view",
		aliases: ["reveal", "drive"],
		arguments: [{ name: "path", type: "cloud_path", optional: true }]
	},
	{
		cmd: "favorites",
		aliases: ["favorited"],
		arguments: []
	},
	{
		cmd: "favorite",
		aliases: [],
		arguments: [{ name: "path", type: "cloud_path", optional: true }]
	},
	{
		cmd: "unfavorite",
		aliases: [],
		arguments: [{ name: "path", type: "cloud_path", optional: true }]
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