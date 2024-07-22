import FilenSDK from "@filen/sdk"
import Sync from "@filen/sync/dist/lib/sync"
import SyncWorker from "@filen/sync"
import { randomUUID } from "node:crypto"
import path from "path"
import { SyncPair } from "@filen/sync/dist/types"
import { err } from "../interface/interface"

/**
 * Provides the interface for syncing locations.
 */
export class SyncInterface {
	private readonly filen

	constructor(filen: FilenSDK) {
		this.filen = filen
	}

	public async invoke(locationsStr: string[]) {
		const syncPairs: SyncPair[] = []
		for (const str of locationsStr) {
			const local = str.slice(0, str.lastIndexOf(":"))
			const remote = str.slice(str.lastIndexOf(":") + 1)
			syncPairs.push({
				name: `${local}:${remote}`,
				uuid: randomUUID(),
				localPath: local,
				remotePath: remote,
				remoteParentUUID: (await this.filen.fs().stat({ path: remote })).uuid,
				mode: "twoWay",
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
			sdk: this.filen,
		})
		await Promise.all(syncPairs.map(syncPair => {
			return new Sync({ syncPair, worker }).initialize()
		}))
	}
}