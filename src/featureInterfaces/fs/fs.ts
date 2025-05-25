import FilenSDK from "@filen/sdk"
import pathModule from "path"
import { directorySize, doNothing, getItemPaths, hashFile } from "../../util/util"
import { CloudPath } from "../../util/cloudPath"
import * as fsModule from "node:fs"
import open from "open"
import { displayTransferProgressBar, formatBytes, formatTable, formatTimestamp } from "../../interface/util"
import { App } from "../../app"
import { ArgumentType, feature, FeatureGroup, FlagType } from "../../features"
import dedent from "dedent"
import { exportNotesCommand } from "../exportNotesInterface"
import { trashCommandsGroup } from "../trashInterface"
import { publicLinksCommandGroup } from "../publicLinksInterface"

// todo: change all app.outErr into app.errExit (?)

const unixStyleCommands: FeatureGroup = {
	title: "Unix-style commands",
	features: [
		feature({
			cmd: ["ls", "list"],
			description: "List files and directories.",
			flags: {
				long: { name: "-l", type: FlagType.boolean },
			},
			args: {
				directory: { type: ArgumentType.cloudDirectory, optional: true },
			},
			invoke: async ({ app, filen, flags, args, cloudWorkingPath, formatJson }) => {
				const directory = args.directory ?? cloudWorkingPath
				try {
					if (flags.long) {
						const uuid = (await filen.fs().pathToItemUUID({ path: directory.toString() }))
						if (uuid === null) {
							app.outErr(`No such directory: ${directory.toString()}`)
							return
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
						const output = await filen.fs().readdir({ path: directory.toString() })
						if (formatJson) app.outJson(output)
						else app.out(output.join("  "))
					}
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr(`No such directory: ${directory.toString()}`)
					else throw e
				}
			}
		}),
		feature({
			cmd: ["cat"],
			description: "Print the contents of a file.",
			args: {
				file: { type: ArgumentType.cloudFile },
			},
			invoke: async ({ app, filen, args, formatJson }) => {
				try {
					const fileSize = (await filen.fs().stat({ path: args.file.toString() })).size
					if (fileSize > 8192) {
						const result = await app.prompt(`This file is ${formatBytes(fileSize)} large. Continue? [y/N] `)
						if (result.toLowerCase() !== "y") return
					}
					const content = (await filen.fs().readFile({ path: args.file.toString() })).toString()
					if (formatJson) app.outJson({ text: content })
					else app.out(content)
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr(`No such file: ${args.file.toString()}`)
					else throw e
				}
			}
		}),
		...((() => {
			const headOrTail = async (app: App, filen: FilenSDK, cloudWorkingPath: CloudPath, formatJson: boolean, file: CloudPath, nLines: number, command: "head" | "tail") => {
				try {
					const lines = (await filen.fs().readFile({ path: file.toString() })).toString().split("\n")
					const output = (command === "head" ? lines.slice(0, nLines) : lines.slice(lines.length - nLines)).join("\n")
					if (formatJson) app.outJson({ text: output })
					else app.out(output)
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr("No such file")
					else throw e
				}
			}

			return (["head", "tail"] as const).map(cmd => feature({
				cmd: [cmd],
				description: `Print the ${cmd === "head" ? "first" : "last"} lines of a file.`,
				// todo: document -n flag
				flags: {
					lines: { name: "-n", type: FlagType.string },
				},
				args: {
					file: { type: ArgumentType.cloudFile },
				},
				invoke: async ({ app, filen, flags, args, cloudWorkingPath, formatJson }) => {
					const nLines = parseInt(flags.lines ?? "10")
					await headOrTail(app, filen, cloudWorkingPath, formatJson, args.file, nLines, cmd)
				}
			}))
		})()),
		feature({
			cmd: ["mkdir"],
			description: "Create a directory.",
			args: {
				directory: { type: ArgumentType.cloudDirectory },
			},
			invoke: async ({ app, filen, args }) => {
				await filen.fs().mkdir({ path: args.directory.toString() })
				app.outUnlessQuiet(`Directory created: ${args.directory.toString()}`)
			}
		}),
		feature({
			cmd: ["rm", "delete"],
			description: "Delete a file or directory.",
			flags: {
				noTrash: { name: "--no-trash", type: FlagType.boolean },
			},
			args: {
				file: { type: ArgumentType.cloudFile },
			},
			invoke: async ({ app, filen, flags, args }) => {
				if (!await app.promptConfirm(`${flags.noTrash ? "permanently delete" : "delete"} ${args.file.toString()}`)) return
				if (flags.noTrash) if (!await app.promptConfirm(undefined)) return
				try {
					await filen.fs().rm({ path: args.file.toString(), permanent: flags.noTrash })
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr(`No such file or directory: ${args.file.toString()}`)
					else throw e
				}
			}
		}),
		feature({
			cmd: ["stat", "stats"],
			description: "Display information about a file or directory.",
			args: {
				item: { type: ArgumentType.cloudPath },
			},
			invoke: async ({ app, filen, args, formatJson }) => {
				try {
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
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr(`No such file or directory: ${args.item.toString()}`)
					else throw e
				}
			}
		}),
		feature({
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
		feature({
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
		feature({
			cmd: ["mv", "move", "rename"],
			description: "Move or rename a file or directory.",
			args: {
				from: { type: ArgumentType.cloudPath },
				to: { type: ArgumentType.cloudPath },
			},
			invoke: async ({ app, filen, args }) => {
				const from = args.from
				const to = await from.appendFileNameIfNecessary(filen, from.getLastSegment())
				try {
					await filen.fs().rename({ from: from.toString(), to: to.toString() })
					app.outUnlessQuiet(`Moved ${from.toString()} to ${to.toString()}`)
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr(`No such file or directory: ${args.from.toString()}`)
					else throw e
				}
			}
		}),
		feature({
			cmd: ["cp", "copy"],
			description: "Copy a file or directory.",
			args: {
				from: { type: ArgumentType.cloudPath },
				to: { type: ArgumentType.cloudPath },
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
					if (e instanceof Error && e.message.toLowerCase() === "aborted") app.outErr("Aborted")
					else throw e
				}
			}
		}),
	]
}

const filenSpecificCommands: FeatureGroup = {
	title: "Filen-specific commands",
	features: [
		feature({
			cmd: ["upload"],
			description: "Upload a local file into the cloud at a specified path.",
			args: {
				source: { type: ArgumentType.localFile },
				cloudPath: { type: ArgumentType.cloudPath },
			},
			invoke: async ({ app, filen, args, quiet }) => {
				const stat = fsModule.statSync(args.source, { throwIfNoEntry: false })
				if (stat === undefined) {
					app.outErr("No such source directory")
					return
				}
				const size = stat.isDirectory() ? (await directorySize(args.source)) : stat.size
				args.cloudPath = await args.cloudPath.appendFileNameIfNecessary(filen, args.source.split(/[/\\]/)[args.source.split(/[/\\]/).length - 1]!)
				const progressBar = quiet ? null : displayTransferProgressBar(app, "Uploading", args.cloudPath.getLastSegment(), size)
				try {
					const abortSignal = app.createAbortSignal()
					await filen.fs().upload({
						path: args.cloudPath.toString(),
						source: args.source,
						onProgress: quiet ? doNothing : progressBar!.onProgress,
						abortSignal
					})
				} catch (e) {
					if (progressBar) progressBar.progressBar.stop()
					if (e instanceof Error && e.message.toLowerCase() === "aborted") app.outErr("Aborted")
					else throw e
				}
			}
		}),
		feature({
			cmd: ["download"],
			description: "Download a file or directory from the cloud into a local destination.",
			args: {
				source: { type: ArgumentType.cloudFile },
				destination: { type: ArgumentType.localPath, optional: true },
			},
			invoke: async ({ app, filen, args, quiet }) => {
				try {
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
						if (e instanceof Error && e.message.toLowerCase() === "aborted") app.outErr("Aborted")
						else throw e
					}
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr(`No such file or directory: ${args.source.toString()}`)
					else throw e
				}
			}
		}),
		feature({
			cmd: ["write", "touch"],
			description: "Write plain text to a file.",
			args: {
				file: { type: ArgumentType.cloudFile },
				content: { type: ArgumentType.catchAll },
			},
			invoke: async ({ app, filen, args }) => {
				const content = args.content.join(" ")
				await filen.fs().writeFile({ path: args.file.toString(), content: Buffer.from(content) })
				app.outUnlessQuiet(`Wrote to ${args.file.toString()}`)
			}
		}),
		...(() => {
			const openOrEdit = async (app: App, filen: FilenSDK, file: CloudPath, cmd: "open" | "edit") => {
				try {
					const downloadPath = pathModule.join(filen.config.tmpPath ?? process.cwd(), file.getLastSegment())
					await filen.fs().download({ path: file.toString(), destination: downloadPath })
					const hash = cmd === "open" ? null : await hashFile(downloadPath)
					await open(downloadPath, { wait: true })
					if (cmd === "edit" && (await hashFile(downloadPath)) !== hash) {
						await filen.fs().upload({ path: file.toString(), source: downloadPath })
					}
					setTimeout(() => fsModule.unlinkSync(downloadPath), 500)
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr(`No such file: ${file.toString()}`)
					else throw e
				}
			}

			return (["open", "edit"] as const).map(cmd => feature({
				cmd: [cmd],
				description: `Opens a file locally in the associated application${cmd === "edit" ? " (save and close to re-upload)" : ""}.`,
				args: {
					file: { type: ArgumentType.cloudFile },
				},
				invoke: async ({ app, filen, args }) => {
					await openOrEdit(app, filen, args.file, cmd)
				}
			}))
		})(),
		feature({
			cmd: ["view", "reveal", "drive"],
			description: "View a directory in the Web Drive (you can also invoke filen drive to quickly open the Web Drive).",
			args: {
				path: { type: ArgumentType.cloudDirectory, optional: true },
			},
			invoke: async ({ app, filen, args, cloudWorkingPath, quiet, formatJson }) => {
				args.path = args.path ?? cloudWorkingPath
				try {
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
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr(`No such file or directory: ${args.path.toString()}`)
					else throw e
				}
			}
		}),
		...(["favorites", "recents"]).map(cmd => feature({
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
		...(["favorite", "unfavorite"]).map(cmd => feature({
			cmd: cmd === "favorite"
				? ["favorite", "favourite"]
				: ["unfavorite", "unfavourite"],
			description: `${cmd === "favorite" ? "Favorite" : "Unfavorite"} a file or directory.`,
			args: {
				item: { type: ArgumentType.cloudPath },
			},
			invoke: async ({ app, filen, args }) => {
				try {
					const item = await filen.fs().stat({ path: args.item.toString() })
					if (item.type === "file") {
						await filen.cloud().favoriteFile({ uuid: item.uuid, favorite: cmd === "favorite" })
					} else {
						await filen.cloud().favoriteDirectory({ uuid: item.uuid, favorite: cmd === "favorite" })
					}
					app.outUnlessQuiet(`${cmd === "favorite" ? "Favorited" : "Unfavorited"} ${args.item.toString()}`)
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr(`No such file or directory: ${args.item.toString()}`)
					else throw e
				}
			}
		})),
	]
}

const interactiveModeCommands: FeatureGroup = {
	title: "Interactive mode",
	features: [
		feature({
			cmd: ["cd", "navigate"],
			description: "Navigate to a different path.",
			args: {
				directory: { type: ArgumentType.cloudDirectory },
			},
			invoke: async ({ app, filen, args }) => {
				try {
					const directory = await filen.fs().stat({ path: args.directory.toString() })
					if (!directory.isDirectory()) app.outErr("Not a directory")
					else return { cloudWorkingPath: args.directory }
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") app.outErr(`No such directory: ${args.directory.toString()}`)
					else throw e
				}
			}
		}),
		feature({
			cmd: ["exit", "quit", "q"],
			description: "Exit the application.",
			invoke: async () => ({ exit: true }),
		}),
	]
}

export const fsCommands: FeatureGroup = {
	title: "Filesystem commands",
	name: "fs",
	description: "Access your Filen drive.",
	longDescription: dedent`
		Additional options:
		${formatTable([
			["--root <path>, -r <path>", "execute commands from a different working directory"],
			["--json", "format output as JSON"],
			["--no-autocomplete", "disable autocompletion (for performance or bandwidth reasons)"],
		])}`, // todo: are all these options really specific to fs commands?
	features: [
		unixStyleCommands,
		filenSpecificCommands,
		interactiveModeCommands,
		exportNotesCommand,
		trashCommandsGroup,
		publicLinksCommandGroup,
	]
}
