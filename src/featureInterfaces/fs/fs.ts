import pathModule from "path"
import { directorySize, doNothing, getItemPaths, hashFile } from "../../util/util"
import { CloudPath } from "../../util/cloudPath"
import * as fsModule from "node:fs"
import open from "open"
import { displayTransferProgressBar, formatBytes, formatTable, formatTimestamp } from "../../interface/util"
import dedent from "dedent"
import { exportNotesCommand } from "../exportNotesInterface"
import { trashCommandsGroup } from "../trashInterface"
import { publicLinksCommandGroup } from "../publicLinksInterface"
import { f, X } from "../../app"
import { FeatureGroup } from "../../framework/features"

const unixStyleCommands: FeatureGroup<X> = {
	title: "Unix-style commands",
	features: [
		f.feature({
			cmd: ["ls", "list"],
			description: "List files and directories.",
			args: {
				directory: f.cloudPath({ restrictType: "directory" }, f.optionalArg({ name: "directory", description: "directory to list (default: the current directory)" })), // todo: optional
				long: f.flag({ name: "--long", alias: "-l", description: "use a long listing format" }),
			},
			invoke: async ({ app, filen, args, formatJson }) => {
				if (args.long) {
					const uuid = (await filen.fs().pathToItemUUID({ path: args.directory.toString() }))
					if (uuid === null) {
						return app.errExit(`No such directory: ${args.directory.toString()}`)
					}
					const items = await filen.cloud().listDirectory({ uuid })
					if (formatJson) {
						app.outJson(items.map(item => {
							return {
								name: item.name,
								type: item.type,
								size: item.type === "file" ? item.size : undefined,
								modified: item.lastModified,
								favorited: item.favorited
							}
						}))
					} else {
						app.out(formatTable(items.map(item => [
							item.type === "file" ? formatBytes(item.size) : "",
							formatTimestamp(item.lastModified),
							item.name,
							item.favorited ? "(*)" : ""
						]), 2, true))
					}
				} else {
					const output = await filen.fs().readdir({ path: args.directory.toString() })
					if (formatJson) app.outJson(output)
					else app.out(output.join("  "))
				}
			}
		}),
		f.feature({
			cmd: ["cat"],
			description: "Print the contents of a file.",
			args: {
				file: f.cloudPath({ restrictType: "file" }, f.arg({ name: "file", description: "file to read" })),
			},
			invoke: async ({ app, filen, args, formatJson }) => {
				const fileSize = (await filen.fs().stat({ path: args.file.toString() })).size
				if (fileSize > 8192) {
					const result = await app.prompt(`This file is ${formatBytes(fileSize)} large. Continue? [y/N] `)
					if (result.toLowerCase() !== "y") return
				}
				const content = (await filen.fs().readFile({ path: args.file.toString() })).toString()
				if (formatJson) app.outJson({ text: content })
				else app.out(content)
			}
		}),
		...(["head", "tail"] as const).map(cmd => f.feature({
			cmd: [cmd],
			description: `Print the ${cmd === "head" ? "first" : "last"} lines of a file.`,
			args: {
				file: f.cloudPath({ restrictType: "file" }, f.arg({ name: "file", description: "file to read" })),
				lines: f.number(f.option({ name: "-n", description: "number of lines to print" })),
			},
			invoke: async ({ app, x, args, formatJson }) => {
				const { filen } = x
				const nLines = args.lines ?? 10
				
				const lines = (await filen.fs().readFile({ path: args.file.toString() })).toString().split("\n")
				const output = (cmd === "head" ? lines.slice(0, nLines) : lines.slice(lines.length - nLines)).join("\n")
				if (formatJson) app.outJson({ text: output })
				else app.out(output)
			}
		})),
		f.feature({
			cmd: ["mkdir"],
			description: "Create a directory.",
			args: {
				directory: f.cloudPath({ restrictType: "directory" }, f.arg({ name: "directory", description: "directory to create" }))
			},
			invoke: async ({ app, filen, args }) => {
				await filen.fs().mkdir({ path: args.directory.toString() })
				app.outUnlessQuiet(`Directory created: ${args.directory.toString()}`)
			}
		}),
		f.feature({
			cmd: ["rm", "delete"],
			description: "Delete a file or directory.",
			args: {
				path: f.arg({ name: "path", description: "file or directory to delete" }),
				noTrash: f.flag({ name: "--no-trash", description: "permanently delete the file or directory" }),
			},
			invoke: async ({ app, filen, args }) => {
				if (!await app.promptConfirm(`${args.noTrash ? "permanently delete" : "delete"} ${args.path.toString()}`)) return
				if (args.noTrash) if (!await app.promptConfirm(undefined)) return
				try {
					await filen.fs().rm({ path: args.path.toString(), permanent: args.noTrash })
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.errExit(`No such file or directory: ${args.path.toString()}`)
					else throw e
				}
			}
		}),
		f.feature({
			cmd: ["stat", "stats"],
			description: "Display information about a file or directory.",
			args: {
				item: f.cloudPath({}, f.arg({ name: "item", description: "file or directory to display information about" })),
			},
			invoke: async ({ app, filen, args, formatJson }) => {
				const stat = await filen.fs().stat({ path: args.item.toString() })
				const size = stat.isFile() ? stat.size : (await filen.cloud().directorySize({ uuid: stat.uuid })).size

				if (formatJson) {
					app.outJson({
						file: stat.name,
						type: stat.type,
						size: size,
						mtimeMs: stat.mtimeMs,
						birthtimeMs: stat.birthtimeMs
					})
				} else {
					app.out(`  File: ${stat.name}`)
					app.out(`  Type: ${stat.type}`)
					app.out(`  Size: ${formatBytes(size)}`)
					app.out(`Modify: ${formatTimestamp(stat.mtimeMs)}`)
					app.out(` Birth: ${formatTimestamp(stat.birthtimeMs)}`)
				}
			}
		}),
		f.feature({
			cmd: ["statfs"],
			description: "Display information about your Filen cloud drive.",
			invoke: async ({ app, filen, formatJson }) => {
				const statfs = await filen.fs().statfs()
				if (formatJson) {
					app.outJson({
						used: statfs.used,
						max: statfs.max
					})
				} else {
					app.out(`Used: ${formatBytes(statfs.used)}`)
					app.out(` Max: ${formatBytes(statfs.max)}`)
				}
			}
		}),
		f.feature({
			cmd: ["whoami"],
			description: "Print your Filen account email.",
			invoke: async ({ app, filen, formatJson }) => {
				const email = filen.config.email
				if (formatJson) {
					app.outJson({ email })
				} else {
					app.out(email ?? "")
				}
			}
		}),
		f.feature({
			cmd: ["mv", "move", "rename"],
			description: "Move or rename a file or directory.",
			args: {
				from: f.cloudPath({}, f.arg({ name: "from", description: "source file or directory" })),
				to: f.cloudPath({}, f.arg({ name: "to", description: "destination path or parent directory" })),
			},
			invoke: async ({ app, filen, args }) => {
				const from = args.from
				const to = await from.appendFileNameIfNecessary(filen, from.getLastSegment())
				await filen.fs().rename({ from: from.toString(), to: to.toString() })
				app.outUnlessQuiet(`Moved ${from.toString()} to ${to.toString()}`)
			}
		}),
		f.feature({
			cmd: ["cp", "copy"],
			description: "Copy a file or directory.",
			args: {
				from: f.cloudPath({}, f.arg({ name: "from", description: "source file or directory" })),
				to: f.cloudPath({}, f.arg({ name: "to", description: "destination path or parent directory" })),
			},
			invoke: async ({ app, filen, args, quiet }) => {
				const from = args.from
				const to = from.appendFileNameIfNecessary(filen, from.getLastSegment())

				const fromSize = (await filen.fs().stat({ path: from.toString() })).size
				let progressBar = quiet ? null : displayTransferProgressBar(app, "Downloading", from.getLastSegment(), fromSize, true)
				let stillDownloading = true
				const onProgress = quiet
					? doNothing
					: (transferred: number) => {
						progressBar!.onProgress(transferred)
						if (progressBar!.progressBar.getProgress() >= 1 && stillDownloading) {
							stillDownloading = false
							progressBar = displayTransferProgressBar(app, "Uploading", from.getLastSegment(), fromSize, true)
						}
					}
				try {
					const abortSignal = app.createAbortSignal()
					await filen.fs().copy({ from: from.toString(), to: to.toString(), onProgress, abortSignal })
					app.outUnlessQuiet(`Copied ${from.toString()} to ${to.toString()}`)
				} catch (e) {
					if (progressBar) progressBar.progressBar.stop()
					if (e instanceof Error && e.message.toLowerCase() === "aborted") app.errExit("Aborted")
					else throw e
				}
			}
		}),
	]
}

const filenSpecificCommands: FeatureGroup<X> = {
	title: "Filen-specific commands",
	features: [
		f.feature({
			cmd: ["upload"],
			description: "Upload a local file into the cloud at a specified path.",
			args: {
				source: f.arg({ name: "source", description: "local file to upload" }), // todo: check that it exists
				destination: f.cloudPath({}, f.arg({ name: "destination", description: "destination path or parent directory" })),
			},
			invoke: async ({ app, filen, args, quiet }) => {
				const stat = fsModule.statSync(args.source, { throwIfNoEntry: false })
				if (stat === undefined) return app.errExit("No such source directory") // todo: remove when checked that it exists
				const size = stat.isDirectory() ? (await directorySize(args.source)) : stat.size
				args.destination = await args.destination.appendFileNameIfNecessary(filen, args.source.split(/[/\\]/)[args.source.split(/[/\\]/).length - 1]!)
				const progressBar = quiet ? null : displayTransferProgressBar(app, "Uploading", args.destination.getLastSegment(), size)
				try {
					const abortSignal = app.createAbortSignal()
					await filen.fs().upload({
						path: args.destination.toString(),
						source: args.source,
						onProgress: quiet ? doNothing : progressBar!.onProgress,
						abortSignal
					})
				} catch (e) {
					if (progressBar) progressBar.progressBar.stop()
					if (e instanceof Error && e.message.toLowerCase() === "aborted") app.errExit("Aborted")
					else throw e
				}
			}
		}),
		f.feature({
			cmd: ["download"],
			description: "Download a file or directory from the cloud into a local destination.",
			args: {
				source: f.cloudPath({}, f.arg({ name: "source", description: "cloud file or directory" })),
				destination: f.optionalArg({ name: "destination", description: "local destination path (default: current working directory)" }),
			},
			invoke: async ({ app, filen, args, quiet }) => {
				// todo: resolve ArgumentType.localPath in feature()
				const rawPath = args.destination === undefined || args.destination === "." ? process.cwd() + "/" : args.destination
				const path = rawPath.endsWith("/") || rawPath.endsWith("\\") ? pathModule.join(rawPath, args.source.getLastSegment()) : rawPath
				const size = (await filen.fs().stat({ path: args.source.toString() })).size
				const progressBar = quiet ? null : displayTransferProgressBar(app, "Downloading", args.source.getLastSegment(), size)
				try {
					const abortSignal = app.createAbortSignal()
					await filen.fs().download({
						path: args.source.toString(),
						destination: path,
						onProgress: progressBar?.onProgress ?? doNothing,
						abortSignal
					})
				} catch (e) {
					if (progressBar) progressBar.progressBar.stop()
					if (e instanceof Error && e.message.toLowerCase() === "aborted") app.errExit("Aborted")
					else throw e
				}
			}
		}),
		f.feature({
			cmd: ["write", "touch"],
			description: "Write plain text to a file.",
			args: {
				file: f.cloudPath({}, f.arg({ name: "file", description: "file to write to (will be created if it doesn't exist)" })),
				content: f.catchAll({ name: "content", description: "any string content" }),
			},
			invoke: async ({ app, filen, args }) => {
				const content = args.content.join(" ")
				await filen.fs().writeFile({ path: args.file.toString(), content: Buffer.from(content) })
				app.outUnlessQuiet(`Wrote to ${args.file.toString()}`)
			}
		}),
		...(["open", "edit"] as const).map(cmd => f.feature({
			cmd: [cmd],
			description: `Opens a file locally in the associated application${cmd === "edit" ? " (save and close to re-upload)" : ""}.`,
			args: {
				file: f.cloudPath({ restrictType: "file" }, f.arg({ name: "file", description: `file to ${cmd}` })),
			},
			invoke: async ({ filen, args }) => {
				const downloadPath = pathModule.join(filen.config.tmpPath ?? process.cwd(), args.file.getLastSegment())
				await filen.fs().download({ path: args.file.toString(), destination: downloadPath })
				const hash = cmd === "open" ? null : await hashFile(downloadPath)
				await open(downloadPath, { wait: true })
				if (cmd === "edit" && (await hashFile(downloadPath)) !== hash) {
					await filen.fs().upload({ path: args.file.toString(), source: downloadPath })
				}
				setTimeout(() => fsModule.unlinkSync(downloadPath), 500)
			}
		})),
		f.feature({
			cmd: ["view", "reveal", "drive"],
			description: "View a directory in the Web Drive (you can also invoke filen drive to quickly open the Web Drive).",
			args: {
				path: f.cloudPath({}, f.optionalArg({ name: "path", description: "file or directory to view" })),
			},
			invoke: async ({ app, filen, args, quiet, formatJson }) => {
				if ((await filen.fs().stat({ path: args.path.toString() })).isFile()) {
					args.path = args.path.navigate("..")
				}
				const getUrlSegments = async (path: CloudPath): Promise<string[]> => {
					const uuid = await filen.fs().pathToItemUUID({ path: path.toString() })
					if (path.cloudPath.length > 0) return [ ...await getUrlSegments(path.navigate("..")), uuid!.toString() ]
					else return [ uuid!.toString() ]
				}
				const urlSegments = await getUrlSegments(args.path)
				const url = `https://drive.filen.io/#/${urlSegments.join("/")}`
				if (!quiet) {
					if (formatJson) app.outJson({ url })
					else app.out(url)
				}
				await open(url, { wait: true })
			}
		}),
		...(["favorites", "recents"]).map(cmd => f.feature({
			cmd: cmd === "favorites"
				? ["favorites", "favorited", "favourites", "favourited", "fav", "favs"]
				: ["recents", "recently", "recent"],
			description: `Display all ${cmd === "favorites" ? "favorited" : "recently used"} files and directories.`,
			invoke: async ({ app, filen, formatJson }) => {
				const items = cmd === "favorites"
					? await filen.cloud().listFavorites()
					: await filen.cloud().listRecents()
				if (formatJson) {
					app.outJson((await getItemPaths(filen, items)).map(item => ({ path: item.path })))
				} else {
					app.out((await getItemPaths(filen, items)).map(item => item.path).join("\n"))
				}
			}
		})),
		...(["favorite", "unfavorite"]).map(cmd => f.feature({
			cmd: cmd === "favorite"
				? ["favorite", "favourite"]
				: ["unfavorite", "unfavourite"],
			description: `${cmd === "favorite" ? "Favorite" : "Unfavorite"} a file or directory.`,
			args: {
				item: f.cloudPath({}, f.arg({ name: "item", description: `file or directory to ${cmd}` })),
			},
			invoke: async ({ app, filen, args }) => {
				const item = await filen.fs().stat({ path: args.item.toString() })
				if (item.type === "file") {
					await filen.cloud().favoriteFile({ uuid: item.uuid, favorite: cmd === "favorite" })
				} else {
					await filen.cloud().favoriteDirectory({ uuid: item.uuid, favorite: cmd === "favorite" })
				}
				app.outUnlessQuiet(`${cmd === "favorite" ? "Favorited" : "Unfavorited"} ${args.item.toString()}`)
			}
		})),
	]
}

const interactiveModeCommands: FeatureGroup<X> = {
	title: "Interactive mode",
	features: [
		f.feature({
			cmd: ["cd", "navigate"],
			description: "Navigate to a different path.",
			args: {
				directory: f.cloudPath({ restrictType: "directory" }, f.arg({ name: "directory", description: "path to navigate" })),
			},
			invoke: async ({ app, filen, args, isInteractiveMode, x }) => {
				if (!isInteractiveMode) {
					app.errExit("To navigate in a stateful environment, invoke the CLI without a command.")
				}
				const directory = await filen.fs().stat({ path: args.directory.toString() })
				if (!directory.isDirectory()) return app.errExit("Not a directory")
				return { ctx: { x: { ...x, cloudWorkingPath: args.directory } } }
			}
		}),
		f.feature({
			cmd: ["exit", "quit", "q"],
			description: "Exit the application.",
			invoke: async () => ({ exit: true }),
		}),
	]
}

export const fsCommands: FeatureGroup<X> = {
	title: "Filesystem commands",
	name: "fs",
	description: "Access your Filen drive.",
	longDescription: dedent`
		Additional options:
		${formatTable([
			["--root <path>, -r <path>", "execute commands from a different working directory"],
			["--json", "format output as JSON"],
			["--no-autocomplete", "disable autocompletion (for performance or bandwidth reasons)"],
		])}`,
	features: [
		unixStyleCommands,
		filenSpecificCommands,
		interactiveModeCommands,
		exportNotesCommand,
		trashCommandsGroup,
		publicLinksCommandGroup,
	]
}
