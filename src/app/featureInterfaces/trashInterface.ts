import FilenSDK, { CloudItem } from "@filen/sdk"
import { formatBytes, formatTable, formatTimestamp } from "../../framework/util"
import { FeatureGroup } from "../../framework/features"
import { f, X } from "../f"
import { App } from "../../framework/app"

async function getTrashItems(app: App<X>, filen: FilenSDK) {
	const items = await filen.cloud().listTrash()
	if (items.length === 0) {
		app.out("Trash is empty.")
		return
	}
	return items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

function printTrashItems(app: App<X>, items: CloudItem[], showIndices: boolean) {
	app.out(formatTable(items.map((item, i) => [
		...(showIndices ? [`(${i+1})`] : []),
		item.type === "file" ? formatBytes(item.size) : "",
		formatTimestamp(item.lastModified),
		item.name
	]), 2, !showIndices))
}

async function deleteOrRestoreItem(app: App<X>, filen: FilenSDK, trashItems: CloudItem[], mode: "delete" | "restore") {
	printTrashItems(app, trashItems, true)
	const selection = parseInt(await app.prompt(`Select an item to ${mode === "delete" ? "permanently delete" : "restore"} (1-${trashItems.length}): `, { allowExit: true }))
	if (isNaN(selection) || selection < 1 || selection > trashItems.length) app.errExit("Invalid selection!")
	const item = trashItems[selection-1]!
	if (mode === "delete") {
		if (!await app.promptConfirm(`permanently delete ${item.name}`)) return
		if (item.type === "file") {
			await filen.cloud().deleteFile({ uuid: item.uuid })
		} else {
			await filen.cloud().deleteDirectory({ uuid: item.uuid })
		}
	} else {
		if (item.type === "file") {
			await filen.cloud().restoreFile({ uuid: item.uuid })
		} else {
			await filen.cloud().restoreDirectory({ uuid: item.uuid })
		}
	}
}

export const trashCommandsGroup: FeatureGroup<X> = {
	title: "Trash",
	name: "trash",
	description: "Manage trash items.",
	features: [
		f.feature({
			cmd: ["trash", "trash list", "trash ls", "trash view"],
			description: "List trash items.",
			invoke: async ({ app, filen }) => {
				const trashItems = await getTrashItems(app, filen)
				if (trashItems === undefined) return
				printTrashItems(app, trashItems, false)
			}
		}),
		f.feature({
			cmd: ["trash delete"],
			description: "Permanently delete a trash item.",
			invoke: async ({ app, filen }) => {
				const trashItems = await getTrashItems(app, filen)
				if (trashItems === undefined) return
				await deleteOrRestoreItem(app, filen, trashItems, "delete")
			}
		}),
		f.feature({
			cmd: ["trash restore"],
			description: "Restore a trash item.",
			invoke: async ({ app, filen }) => {
				const trashItems = await getTrashItems(app, filen)
				if (trashItems === undefined) return
				await deleteOrRestoreItem(app, filen, trashItems, "restore")
			}
		}),
		f.feature({
			cmd: ["trash empty"],
			description: "Permanently delete all trash items.",
			invoke: async ({ app, filen }) => {
				const trashItems = await getTrashItems(app, filen)
				if (trashItems === undefined) return
				if (!await app.promptConfirm(`permanently delete all ${trashItems.length} trash items`)) return
				if (!await app.promptConfirm(undefined)) return
				await filen.cloud().emptyTrash()
			}
		})
	]
}