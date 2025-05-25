import FilenSDK, { CloudItem } from "@filen/sdk"
import { formatBytes, formatTable, formatTimestamp } from "../interface/util"
import { App } from "../app"
import { feature, FeatureGroup } from "../features"

async function getTrashItems(app: App, filen: FilenSDK) {
	const items = await filen.cloud().listTrash()
	if (items.length === 0) {
		app.out("Trash is empty.")
		return
	}
	return items
}

function printTrashItems(app: App, items: CloudItem[], showIndices: boolean) {
	app.out(formatTable(items.map((item, i) => [
		...(showIndices ? [`(${i+1})`] : []),
		item.type === "file" ? formatBytes(item.size) : "",
		formatTimestamp(item.lastModified),
		item.name
	]), 2, !showIndices))
}

async function deleteOrRestoreItem(app: App, filen: FilenSDK, trashItems: CloudItem[], mode: "delete" | "restore") {
	printTrashItems(app, trashItems, true)
	const selection = parseInt(await app.prompt(`Select an item to ${mode === "delete" ? "permanently delete" : "restore"} (1-${trashItems.length}): `, { allowExit: true }))
	if (isNaN(selection) || selection < 1 || selection > trashItems.length) app.errExit("Invalid selection!")
	if (mode === "delete") {
		const item = trashItems[selection-1]!
		if (!await app.promptConfirm(`permanently delete ${item.name}`)) return
		await filen.cloud().deleteFile({ uuid: item.uuid })
	} else {
		await filen.cloud().restoreFile({ uuid: trashItems[selection-1]!.uuid })
	}
}

export const trashCommandsGroup: FeatureGroup = {
	title: "Trash",
	name: "trash",
	description: "Manage trash items.",
	features: [
		feature({
			cmd: ["trash", "trash list", "trash ls", "trash view"],
			description: "List trash items.",
			invoke: async ({ app, filen }) => {
				const trashItems = await getTrashItems(app, filen)
				if (trashItems === undefined) return
				printTrashItems(app, trashItems, false)
			}
		}),
		feature({
			cmd: ["trash delete"], // todo: same issue as with `links <link>`, see comment there
			description: "Permanently delete a trash item.",
			invoke: async ({ app, filen }) => {
				const trashItems = await getTrashItems(app, filen)
				if (trashItems === undefined) return
				await deleteOrRestoreItem(app, filen, trashItems, "delete")
			}
		}),
		feature({
			cmd: ["trash restore"],
			description: "Restore a trash item.",
			invoke: async ({ app, filen }) => {
				const trashItems = await getTrashItems(app, filen)
				if (trashItems === undefined) return
				await deleteOrRestoreItem(app, filen, trashItems, "restore")
			}
		}),
		feature({
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