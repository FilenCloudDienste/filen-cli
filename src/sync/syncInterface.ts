import FilenSDK from "@filen/sdk"
import SyncWorker from "@filen/sync"
import { randomUUID } from "node:crypto"
import path from "path"
import { SyncMode, SyncPair } from "@filen/sync/dist/types"
import { err, errExit } from "../interface/interface"

/**
 * Provides the interface for syncing.
 */
export class SyncInterface {
	private readonly filen

	private readonly syncModes = new Map<string, SyncMode>([
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
		["::", "twoWay"],
		[":", "twoWay"],
	])

	constructor(filen: FilenSDK) {
		this.filen = filen
	}

	public async invoke(locationsStr: string[]) {
		const syncPairs: SyncPair[] = []
		for (const str of locationsStr) {
			let local
			let remote
			let syncMode: SyncMode | undefined = undefined
			for (const syncModeMapping of this.syncModes.entries()) {
				if (str.includes(syncModeMapping[0])) {
					local = str.slice(0, str.lastIndexOf(syncModeMapping[0]))
					remote = str.slice(str.lastIndexOf(syncModeMapping[0]) + syncModeMapping[0].length)
					syncMode = syncModeMapping[1]
					break
				}
			}
			if (local === undefined || remote === undefined || syncMode === undefined) {
				errExit("Apparently alias: " + str + " (not yet implemented)")
			}
			syncPairs.push({
				name: `${local}:${remote}`,
				uuid: randomUUID(),
				localPath: local,
				remotePath: remote,
				remoteParentUUID: (await this.filen.fs().stat({ path: remote })).uuid,
				mode: syncMode,
				excludeDotFiles: false,
				paused: false
			})
		}
		const worker = new SyncWorker({
			syncPairs,
			dbPath: path.join(__dirname, "db"),
			sdkConfig: this.filen.config,
			onMessage: msg => {
				if (msg.type.includes("error")) err(msg.toString())
				if (msg.type === "cycleExited") process.exit()
			},
			runOnce: true,
		})
		await worker.initialize()
	}
}