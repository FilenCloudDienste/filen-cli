import FilenSDK from "@filen/sdk"
import SyncWorker, { SerializedError } from "@filen/sync"
import pathModule from "path"
import { SyncMessage, SyncMode, SyncPair } from "@filen/sync/dist/types"
import fsModule, { PathLike } from "node:fs"
import { displayTransferProgressBar, exists } from "../util/util"
import getUuidByString from "uuid-by-string"
import os from "os"
import { f, X } from "../f"
import dedent from "dedent"
import { App } from "../../framework/app"

export const syncCommand = f.feature({
	cmd: ["sync"],
	description: "Sync files and directories to/from your Filen drive.",
	longDescription: dedent`
		This is the same functionality you get with the Desktop app.

		Examples:
		\`filen sync\`
			read sync pairs from {dataDir}/syncPairs.json ({dataDir} is described in \`filen help data-dir\`)
			syncPairs.json is of the type:
				{local: string, remote: string, syncMode: string, alias?: string, disableLocalTrash?: boolean, ignore?: string[], excludeDotFiles?: boolean}[]
				(written as a TypeScript type definition, where \`?\` denotes an optional property)
			\`syncMode\` can be \`twoWay\`, \`localToCloud\`, \`localBackup\`, \`cloudToLocal\`, or \`cloudBackup\` (see https://docs.filen.io/docs/cli/syncing#sync-modes)
		\`filen sync <file>\`
			read sync pairs from custom JSON file
		\`filen sync mypair myotherpair\`
			use aliases as defined in syncPairs.json
		\`filen sync /local/path:/cloud/path\`
		    sync the local path \`/local/path\` with the cloud path \`/cloud/path\` in two-way sync
		\`filen sync /local1:twoWay:/cloud1 /local2:tw:/cloud2\`
			sync the local path \`/local1\` (and \`/local2\`) with the cloud path \`/cloud1\` (and \`/cloud2\`) in two-way sync
			other abbreviations are: \`tw\` = \`twoWay\`, \`ltc\` = \`localToCloud\`, \`lb\` = \`localBackup\`, \`ctl\` = \`cloudToLocal\`, \`cb\` = \`cloudBackup\`
	`,
	args: {
		locations: f.catchAllArg({ name: "locations", description: "one or many sync pairs (see the examples)" }),
		continuous: f.flag({ name: "--continuous", description: "keep syncing (instead of only syncing once)" }),
		disableLocalTrash: f.flag({ name: "--disable-local-trash", description: "disable local trash" }),
	},
	invoke: async ({ app, filen, args, quiet }) => {
		new SyncInterface(app, filen, quiet).invoke(args.locations, args.continuous, args.disableLocalTrash)
	},
})

export type RawSyncPair = {
	local: string
	remote: string
	syncMode: SyncMode
	ignoreContent: string
	excludeDotFiles: boolean
	disableLocalTrash: boolean
}

const syncModes = [
	"twoWay",
	"localToCloud",
	"localBackup",
	"cloudToLocal",
	"cloudBackup",
]
const syncModeMappings = new Map<string, SyncMode>([
	[":twoWay:", "twoWay"],
	[":tw:", "twoWay"],
	[":localToCloud:", "localToCloud"],
	[":ltc:", "localToCloud"],
	[":localBackup:", "localBackup"],
	[":lb:", "localBackup"],
	[":cloudToLocal:", "cloudToLocal"],
	[":ctl:", "cloudToLocal"],
	[":cloudBackup:", "cloudBackup"],
	[":cb:", "cloudBackup"],
	[":", "twoWay"],
])

class SyncInterface {
	private readonly defaultSyncPairsRegistry = pathModule.join(this.app.dataDir, "syncPairs.json")

	constructor(private app: App<X>, private filen: FilenSDK, private quiet: boolean) {}

	public invoke(locationsStr: string[], continuous: boolean, disableLocalTrashFlag: boolean) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise<void>(async (resolve, reject) => {
			try {
				const syncPairs = await this.resolveSyncPairs(locationsStr, disableLocalTrashFlag)
				for (const syncPair of syncPairs) {
					this.app.outUnlessQuiet(`Syncing ${syncPair.local} to ${syncPair.remote} (${syncPair.syncMode})...`)
				}

				const fullSyncPairs: SyncPair[] = []
				const ignorerContentsToSet: {uuid: string, content: string}[] = []
				for (const syncPair of syncPairs) {
					const remoteParentStat = await (async () => {
						try {
							return await this.filen.fs().stat({ path: syncPair.remote })
						} catch (e) {
							if (e instanceof Error && e.name === "FileNotFoundError") {
								this.app.outErr(`No such cloud file or directory: ${syncPair.remote}`)
								return undefined
							}
							else throw e
						}
					})()
					if (remoteParentStat === undefined) continue
					const uuid = getUuidByString(`${syncPair.local}:${syncPair.remote}`, getUuidByString("filen-cli"), 3)
					fullSyncPairs.push({
						name: `${syncPair.local}:${syncPair.remote}`,
						uuid,
						localPath: syncPair.local.startsWith("~") ? pathModule.join(os.homedir(), syncPair.local.slice(1)) : syncPair.local, // expand "~" to home directory
						remotePath: syncPair.remote,
						remoteParentUUID: remoteParentStat.uuid,
						mode: syncPair.syncMode,
						excludeDotFiles: syncPair.excludeDotFiles,
						paused: false,
						localTrashDisabled: syncPair.disableLocalTrash
					})
					ignorerContentsToSet.push({
						uuid,
						content: syncPair.ignoreContent,
					})
				}
				const syncPairsExited = new Set<string>()
				const progressBar = continuous ? null : displayTransferProgressBar(this.app, "Transferring", "files", 0)
				const worker = new SyncWorker({
					syncPairs: fullSyncPairs,
					dbPath: pathModule.join(this.app.dataDir, "sync"),
					// @ts-expect-error next-line (other @filen dependencies are not yet updated to the latest @filen/sdk version)
					sdk: this.filen,
					onMessage: msg => {
						this.app.outVerbose(JSON.stringify(msg, null, 2))

						// update progress
						if (progressBar !== null && msg.type === "transfer") {
							if (msg.data.type === "queued") {
								progressBar.progressBar.setTotal(progressBar.progressBar.getTotal() + msg.data.size)
							}
							if (msg.data.type === "progress") {
								progressBar.onProgress(msg.data.bytes)
							}
						}

						// print error
						let isError = msg.type.toLowerCase().includes("error")
						if (msg.type === "taskErrors" || msg.type === "localTreeErrors") isError = msg.data.errors.length > 0
						if (isError) this.printErrorMessage(msg)

						// success messages
						if (continuous && msg.type === "cycleSuccess") {
							this.app.outUnlessQuiet(`Done syncing ${msg.syncPair.localPath} to ${msg.syncPair.remotePath} (${msg.syncPair.mode})`)
						}
						if (!continuous && msg.type === "cycleExited") {
							syncPairsExited.add(msg.syncPair.uuid)
							if (syncPairsExited.size >= syncPairs.length) {
								if (progressBar !== null) progressBar.progressBar.stop()
								if (!this.quiet) {
									if (progressBar?.progressBar.getTotal() ?? 0 > 0) this.app.out("Done.")
									else this.app.out("Done (no files to transfer).")
								}
								resolve()
							}
						}
					},
					runOnce: !continuous,
				})
				await worker.initialize()
				for (const ignorerContent of ignorerContentsToSet) {
					worker.updateIgnorerContent(ignorerContent.uuid, ignorerContent.content)
				}
				if (continuous) {
					this.app.addInterruptListener(() => {
						this.app.out("Stop syncing")
						resolve()
					})
				}
			} catch (e) {
				reject(e)
			}
		})
	}

	private async resolveSyncPairs(locationsStr: string[], disableLocalTrashFlag: boolean): Promise<RawSyncPair[]> {
		if (locationsStr.length === 0) {
			if (!await exists(this.defaultSyncPairsRegistry)) {
				this.app.errExit(`Cannot find central sync pairs registry at ${this.defaultSyncPairsRegistry}.\nCreate it with JSON of type {local: string, remote: string, syncMode: string, alias?: string, excludeDotFiles?: boolean, disableLocalTrash?: boolean, ignore?: []}[]`)
			}
			return (await this.getSyncPairsFromFile(this.defaultSyncPairsRegistry)).syncPairs
		} else if (
			locationsStr.length === 1
			&& await exists(locationsStr[0]!)
			&& !(await fsModule.promises.stat(locationsStr[0]!)).isDirectory()
		) {
			return (await this.getSyncPairsFromFile(locationsStr[0]!)).syncPairs
		} else {
			const syncPairs: RawSyncPair[] = []
			for (const str of locationsStr) {
				syncPairs.push(this.resolveSyncPairLiteral(str, disableLocalTrashFlag) ?? await this.resolveSyncPairAlias(str))
			}
			return syncPairs
		}
	}

	private async getSyncPairsFromFile(path: PathLike): Promise<{ syncPairs: RawSyncPair[], aliases: Map<string, RawSyncPair> }> {
		const syncPairs: RawSyncPair[] = []
		const aliases = new Map<string, RawSyncPair>()

		if (!await exists(path)) {
			this.app.errExit(`You need to create ${path} or specify another sync pairs registry using \`filen sync <path>\`!`)
		}
		const file = JSON.parse((await fsModule.promises.readFile(path)).toString())
		const exitTypeErr = () => this.app.errExit("Invalid sync pairs registry! Needs to be of type: {local: string, remote: string, syncMode: string, alias?: string, excludeDotFiles?: boolean, disableLocalTrash?: boolean, ignore?: string[]}[]")
		const syncPairsObj = Array.isArray(file) ? file : [file]
		for (const obj of syncPairsObj) {
			if (typeof obj.local !== "string") exitTypeErr()
			if (typeof obj.remote !== "string") exitTypeErr()
			const syncMode: string = typeof obj.syncMode === "string" ? obj.syncMode : "twoWay"
			if (!syncModes.includes(syncMode)) exitTypeErr()
			const ignoreContent = (() => {
				if (obj.ignore === undefined) return ""
				if (!Array.isArray(obj.ignore)) exitTypeErr()
				for (const element of obj.ignore) {
					if (typeof element !== "string") exitTypeErr()
				}
				return obj.ignore.join("\n")
			})()
			const syncPair: RawSyncPair = {
				local: obj.local,
				remote: obj.remote,
				syncMode: syncMode as SyncMode,
				excludeDotFiles: obj.excludeDotFiles ?? false,
				disableLocalTrash: obj.disableLocalTrash ?? false,
				ignoreContent
			}
			syncPairs.push(syncPair)
			if (typeof obj.alias === "string") aliases.set(obj.alias, syncPair)
		}

		return { syncPairs, aliases }
	}

	private resolveSyncPairLiteral(str: string, disableLocalTrashFlag: boolean): RawSyncPair | undefined {
		for (const syncModeMapping of syncModeMappings.entries()) {
			if (str.includes(syncModeMapping[0])) {
				return {
					local: str.slice(0, str.lastIndexOf(syncModeMapping[0])),
					remote: str.slice(str.lastIndexOf(syncModeMapping[0]) + syncModeMapping[0].length),
					syncMode: syncModeMapping[1],
					excludeDotFiles: false,
					disableLocalTrash: disableLocalTrashFlag,
					ignoreContent: ""
				}
			}
		}
	}

	private _aliases?: Map<string, RawSyncPair>
	private async resolveSyncPairAlias(str: string): Promise<RawSyncPair> {
		if (this._aliases === undefined) {
			this._aliases = (await this.getSyncPairsFromFile(this.defaultSyncPairsRegistry)).aliases
		}
		const syncPair = this._aliases.get(str)
		if (syncPair === undefined) this.app.errExit("Unknown sync pair alias: " + str)
		return syncPair
	}

	// see https://github.com/FilenCloudDienste/filen-web/blob/main/src/components/syncs/content/issues/issue.tsx
	private readonly errorTypes: Record<string, string> = {
		EPERM: "permission",
		EACCES: "permission",
		EEXIST: "fileOrDirExists",
		ENOENT: "fileOrDirNotFound",
		ENOTDIR: "notDir",
		ECONNREFUSED: "badConnection",
		ENOTFOUND: "badConnection",
		EPIPE: "badConnection",
		ETIMEDOUT: "badConnection",
		EAGAIN: "fileOrDirTemporarilyUnavailable",
		EBUSY: "fileOrDirTemporarilyUnavailable",
		EDESTADDRREQ: "badConnection",
		EFAULT: "io",
		EHOSTUNREACH: "badConnection",
		EINTR: "io",
		EINVAL: "unknown",
		EIO: "io",
		EISCONN: "badConnection",
		EMSGSIZE: "unknown",
		ENETDOWN: "badConnection",
		ENETRESET: "badConnection",
		ENETUNREACH: "badConnection",
		EDOM: "unknown",
		ENOTEMPTY: "dirNotEmpty",
		EMFILE: "openFiles",
		ENAMETOOLONG: "fileOrDirNameTooLong",
		EISFILE: "isFile",
		ENFILE: "io",
		ENOMEM: "io",
		ETXTBSY: "io",
		EAI_SYSTEM: "io",
		EAI_CANCELED: "io",
		EUNKNOWN: "unknown",
		ENODEV: "io",
		ENOBUFS: "io",
		ENOSPC: "noSpace",
		EROFS: "io",
		ECANCELED: "io",
		EBADF: "io",
	}
	private readonly errorMessages: Record<string, string[]> = {
		permission: ["Permissions", "Please ensure the client has all needed permissions to access the local sync directory"],
		io: ["I/O", "Please ensure your local sync directory and underlying storage media works. The client is not able to properly access it"],
		noSpace: ["Not enough space or file watchers available", "You do not have enough local storage space left, or the system ran out of available file watchers"],
		openFiles: ["Open files limit", "The client has hit the limit of open files. Please increase the limit"],
		fileOrDirExists: ["File or directory exists", "This is most likely a temporary issue, try restarting the client"],
		fileOrDirNotFound: ["File or directory not found", "This is most likely a temporary issue, try restarting the client"],
		isFile: ["File", "This is most likely a temporary issue, try restarting the client"],
		isDir: ["Directory", "This is most likely a temporary issue, try restarting the client"],
		notDir: ["Not a directory", "This is most likely a temporary issue, try restarting the client"],
		badConnection: ["Connection", "Please ensure you are connected to the internet and can access Filen without issues"],
		fileOrDirTemporarilyUnavailable: ["File or directory temporarily unavailable", "This is most likely a temporary issue, try restarting the client"],
		unknown: ["Unknown error", "Try restarting the client"],
		dirNotEmpty: ["Directory not empty", "This is most likely a temporary issue, try restarting the client"],
		fileOrDirNameTooLong: ["File or directory name/path too long", "Path too long for your local filesystem"],
	}

	private printErrorMessage(msg: SyncMessage) {
		const error = (() => {
			if (msg.type === "localDirectoryWatcherError") return msg.data.error
			if (msg.type === "cycleError") return msg.data.error
			if (msg.type === "cycleLocalSmokeTestFailed" && Object.prototype.hasOwnProperty.call(msg, "data")) return (msg as {data: {error: SerializedError}}).data.error
			if (msg.type === "cycleRemoteSmokeTestFailed" && Object.prototype.hasOwnProperty.call(msg, "data")) return (msg as {data: {error: SerializedError}}).data.error
			if (msg.type === "error") return msg.data.error
			return undefined
		})()
		if (error !== undefined) {
			for (const errorName of Object.keys(this.errorTypes)) {
				if ((error.name + error.message).includes(errorName)) {
					const errorType = this.errorTypes[errorName]!
					const [title, message] = this.errorMessages[errorType]!
					this.app.outErr(`Error: ${title} (${message})`)
					return
				}
			}
		}
		this.app.out(JSON.stringify(msg, null, 2))
	}
}