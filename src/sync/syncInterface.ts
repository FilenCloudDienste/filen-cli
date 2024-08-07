import FilenSDK from "@filen/sdk"
import SyncWorker from "@filen/sync"
import pathModule from "path"
import { SyncMode, SyncPair } from "@filen/sync/dist/types"
import { err, errExit, out, outJson, quiet, verbose } from "../interface/interface"
import fsModule, { PathLike } from "node:fs"
import { exists, platformConfigPath } from "../util"
import getUuidByString from "uuid-by-string"
import { displayTransferProgressBar } from "../interface/util"

export const syncOptions = {
	"--continuous": Boolean,
	"--disable-local-trash": Boolean,
}

export type RawSyncPair = {
	local: string
	remote: string
	syncMode: SyncMode
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

/**
 * Provides the interface for syncing.
 */
export class SyncInterface {
	private readonly filen

	private readonly defaultSyncPairsRegistry = pathModule.join(platformConfigPath(), "syncPairs.json")

	constructor(filen: FilenSDK) {
		this.filen = filen
	}

	public async invoke(locationsStr: string[], continuous: boolean, disableLocalTrashFlag: boolean) {
		const syncPairs = await this.resolveSyncPairs(locationsStr, disableLocalTrashFlag)
		for (const syncPair of syncPairs) {
			if (!quiet) out(`Syncing ${syncPair.local} to ${syncPair.remote} (${syncPair.syncMode})...`)
		}

		const fullSyncPairs: SyncPair[] = []
		for (const syncPair of syncPairs) {
			fullSyncPairs.push({
				name: `${syncPair.local}:${syncPair.remote}`,
				uuid: getUuidByString(`${syncPair.local}:${syncPair.remote}`, getUuidByString("filen-cli"), 3),
				localPath: syncPair.local,
				remotePath: syncPair.remote,
				remoteParentUUID: (await this.filen.fs().stat({ path: syncPair.remote })).uuid,
				mode: syncPair.syncMode,
				excludeDotFiles: false,
				paused: false,
				localTrashDisabled: syncPair.disableLocalTrash
			})
		}
		const syncPairsExited = new Set<string>()
		const progressBar = continuous ? null : displayTransferProgressBar("Transferring", "files", 0)
		const worker = new SyncWorker({
			syncPairs: fullSyncPairs,
			dbPath: pathModule.join(platformConfigPath(), "sync"),
			sdkConfig: this.filen.config,
			onMessage: msg => {
				if (verbose) outJson(msg)
				if (progressBar !== null && msg.type === "transfer") {
					if (msg.data.type === "queued") {
						progressBar.progressBar.setTotal(progressBar.progressBar.getTotal() + msg.data.size)
					}
					if (msg.data.type === "progress") {
						progressBar.onProgress(msg.data.bytes)
					}
				}
				if (msg.type === "taskErrors" || msg.type === "localTreeErrors") {
					if (msg.data.errors.length > 0) err(JSON.stringify(msg))
				} else {
					if (msg.type.toLowerCase().includes("error")) err(JSON.stringify(msg))
				}
				if (continuous && msg.type === "cycleSuccess") {
					if (!quiet) out(`Done syncing ${msg.syncPair.localPath} to ${msg.syncPair.remotePath} (${msg.syncPair.mode})`)
				}
				if (!continuous && msg.type === "cycleExited") {
					syncPairsExited.add(msg.syncPair.uuid)
					if (syncPairsExited.size >= syncPairs.length) {
						if (progressBar !== null) progressBar.progressBar.stop()
						if (!quiet) out("Done.")
						process.exit()
					}
				}
			},
			runOnce: !continuous,
		})
		await worker.initialize()
	}

	private async resolveSyncPairs(locationsStr: string[], disableLocalTrashFlag: boolean): Promise<RawSyncPair[]> {
		if (locationsStr.length === 0) {
			if (!await exists(this.defaultSyncPairsRegistry)) {
				errExit(`Cannot find central sync pairs registry at ${this.defaultSyncPairsRegistry}.\nCreate it with JSON of type {local: string, remote: string, syncMode: string, alias?: string, disableLocalTrash?: boolean}[]`)
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
			errExit(`You need to create ${path} or specify another sync pairs registry using \`filen sync <path>\`!`)
		}
		const file = JSON.parse((await fsModule.promises.readFile(path)).toString())
		const exitTypeErr = () => errExit("Invalid sync pairs registry! Needs to be of type: {local: string, remote: string, syncMode: string, alias?: string, disableLocalTrash?: boolean}[]")
		if (!Array.isArray(file)) exitTypeErr()
		for (const obj of file) {
			if (typeof obj.local !== "string") exitTypeErr()
			if (typeof obj.remote !== "string") exitTypeErr()
			const syncMode: string = typeof obj.syncMode === "string" ? obj.syncMode : "twoWay"
			if (!syncModes.includes(syncMode)) exitTypeErr()
			const syncPair = { local: obj.local, remote: obj.remote, syncMode: syncMode as SyncMode, disableLocalTrash: obj.disableLocalTrash }
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
					disableLocalTrash: disableLocalTrashFlag
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
		if (syncPair === undefined) errExit("Unknown sync pair alias: " + str)
		return syncPair
	}
}