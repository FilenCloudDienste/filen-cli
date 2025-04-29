import FilenSDK, { CloudItem } from "@filen/sdk"
import { errExit, out, prompt, promptConfirm } from "../interface/interface"
import { formatBytes, formatTable, formatTimestamp } from "../interface/util"

/**
 * Provides the interface for managing trash items.
 */
export class TrashInterface {
	private readonly filen

	constructor(filen: FilenSDK) {
		this.filen = filen
	}
	
	private trashItems: CloudItem[] = []

	public async invoke(args: string[]) {
		this.trashItems = await this.filen.cloud().listTrash()
		if (this.trashItems.length === 0) {
			out("Trash is empty.")
			process.exit()
		}
		if (args.length === 0 || args[0] === "view" || args[0] === "ls" || args[0] === "list") {
			await this.listTrash()
		} else if (args[0] === "delete") {
			await this.deleteOrRestoreTrashItem(true)
		} else if (args[0] === "restore") {
			await this.deleteOrRestoreTrashItem(false)
		} else if (args[0] === "empty") {
			await this.emptyTrash()
		} else {
			errExit("Invalid command! See `filen -h fs` for more info.")
		}
		process.exit()
	}

	private async listTrash() {
		this.printTrashItems(this.trashItems, false)
	}

	private async deleteOrRestoreTrashItem(doDelete: boolean) {
		this.printTrashItems(this.trashItems, true)
		const selection = parseInt(await prompt(`Select an item to ${doDelete ? "permanently delete" : "restore"} (1-${this.trashItems.length}): `, { allowExit: true }))
		if (isNaN(selection) || selection < 1 || selection > this.trashItems.length) errExit("Invalid selection!")
		if (doDelete) {
			const item = this.trashItems[selection-1]!
			if (!await promptConfirm(`permanently delete ${item.name}`)) process.exit()
			await this.filen.cloud().deleteFile({ uuid: item.uuid })
		} else {
			await this.filen.cloud().restoreFile({ uuid: this.trashItems[selection-1]!.uuid })
		}
	}

	private printTrashItems(items: CloudItem[], showIndices: boolean) {
		out(formatTable(items.map((item, i) => [
			...(showIndices ? [`(${i+1})`] : []),
			item.type === "file" ? formatBytes(item.size) : "",
			formatTimestamp(item.lastModified),
			item.name
		]), 2, !showIndices))
	}

	private async emptyTrash() {
		if (!await promptConfirm(`permanently delete all ${this.trashItems.length} trash items`)) process.exit()
		if (!await promptConfirm(undefined)) process.exit()
		await this.filen.cloud().emptyTrash()
	}
}