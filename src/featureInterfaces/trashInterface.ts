import FilenSDK, { CloudItem } from "@filen/sdk"
import { formatBytes, formatTable, formatTimestamp } from "../interface/util"
import { App } from "../app"

/**
 * Provides the interface for managing trash items.
 */
export class TrashInterface {
	constructor(private app: App, private filen: FilenSDK) {}

	public async invoke(args: string[]) {
		if (args.length === 0 || args[0] === "view" || args[0] === "ls" || args[0] === "list") {
			await this.listTrash()
		} else if (args[0] === "delete") {
			await this.deleteOrRestoreTrashItem(true)
		} else if (args[0] === "restore") {
			await this.deleteOrRestoreTrashItem(false)
		} else if (args[0] === "empty") {
			await this.emptyTrash()
		} else {
			this.app.errExit("Invalid command! See `filen -h fs` for more info.")
		}
	}

	private async listTrash() {
		const items = await this.filen.cloud().listTrash()
		this.printTrashItems(items, false)
	}

	private async deleteOrRestoreTrashItem(doDelete: boolean) {
		const items = await this.filen.cloud().listTrash()
		this.printTrashItems(items, true)
		const selection = parseInt(await this.app.prompt(`Select an item to ${doDelete ? "permanently delete" : "restore"} (1-${items.length}): `, { allowExit: true }))
		if (isNaN(selection) || selection < 1 || selection > items.length) this.app.errExit("Invalid selection!")
		if (doDelete) {
			const item = items[selection-1]!
			if (!await this.app.promptConfirm(`permanently delete ${item.name}`)) return
			await this.filen.cloud().deleteFile({ uuid: item.uuid })
		} else {
			await this.filen.cloud().restoreFile({ uuid: items[selection-1]!.uuid })
		}
	}

	private printTrashItems(items: CloudItem[], showIndices: boolean) {
		this.app.out(formatTable(items.map((item, i) => [
			...(showIndices ? [`(${i+1})`] : []),
			item.type === "file" ? formatBytes(item.size) : "",
			formatTimestamp(item.lastModified),
			item.name
		]), 2, !showIndices))
	}

	private async emptyTrash() {
		const items = await this.filen.cloud().listTrash()
		if (!await this.app.promptConfirm(`permanently delete all ${items.length} trash items`)) return
		if (!await this.app.promptConfirm(undefined)) return
		await this.filen.cloud().emptyTrash()
	}
}