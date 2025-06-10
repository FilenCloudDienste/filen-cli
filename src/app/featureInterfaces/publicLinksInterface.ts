import FilenSDK, { PublicLinkExpiration } from "@filen/sdk"
import { formatTable, formatTimestamp } from "../../framework/util"
import { FeatureGroup } from "../../framework/features"
import { f, X } from "../app"
import { getItemPaths } from "../util/util"

async function getPublicLinkStatus(filen: FilenSDK, type: "file" | "directory", uuid: string, fileKey: string | undefined): Promise<{
	type: "file" | "directory"
	uuid: string
	password: string | null
	downloadButtonEnabled: boolean | undefined
	expirationMs: number
	expiration: PublicLinkExpiration
	url: string
} | undefined> {
	if (type === "directory") {
		const publicLinkStatus = await filen.cloud().publicLinkStatus({ type: "directory", uuid })
		if (!publicLinkStatus.exists) return undefined
		const key = await filen.crypto().decrypt().folderLinkKey({ metadata: publicLinkStatus.key })
		return {
			type: "directory",
			uuid: publicLinkStatus.uuid,
			password: publicLinkStatus.password,
			downloadButtonEnabled: undefined,
			expirationMs: publicLinkStatus.expiration! * 1000,
			expiration: publicLinkStatus.expirationText as PublicLinkExpiration,
			url: `https://drive.filen.io/f/${publicLinkStatus.uuid}#${key}` // todo: update to app.filen.io url
		}
	} else {
		const publicLinkStatus = await filen.cloud().publicLinkStatus({ type: "file", uuid })
		if (!publicLinkStatus.enabled) return undefined
		if (fileKey === undefined) throw new Error("Need to provide fileKey!")
		return {
			type: "file",
			uuid: publicLinkStatus.uuid!,
			password: publicLinkStatus.password,
			downloadButtonEnabled: publicLinkStatus.downloadBtn === 1,
			expirationMs: publicLinkStatus.expiration! * 1000,
			expiration: publicLinkStatus.expirationText as PublicLinkExpiration,
			url: `https://drive.filen.io/d/${publicLinkStatus.uuid!}#${fileKey}`
		}
	}
}

export const publicLinksCommandGroup: FeatureGroup<X> = {
	title: "Public Links",
	name: "links",
	description: "Manage public links.",
	features: [
		f.feature({
			cmd: ["links", "link", "link list", "links list", "link ls", "links ls"],
			description: "List public links.",
			invoke: async ({ app, filen }) => {
				const items = await filen.cloud().listPublicLinks()
				const itemsWithPath = await getItemPaths(filen, items)
				if (itemsWithPath.length > 0) {
					app.out(formatTable(await Promise.all(itemsWithPath.map(async item => {
						const publicLink = (await getPublicLinkStatus(filen, item.type, item.uuid, item.type === "file" ? item.key : undefined))!
						return [item.path, publicLink.url]
					}))))
				} else {
					app.out("No public links yet.")
				}
			}
		}),
		f.feature({
			cmd: ["links", "link"], // todo: make this command be resolved correctly
			description: "Create, view, edit or delete a public link.",
			args: {
				path: f.cloudPath({}, f.arg({ name: "path", description: "cloud file or directory this link is for" }))
			},
			invoke: async ({ app, filen, args }) => {
				const item = await filen.fs().stat({ path: args.path.toString() })
				
				const publicLink = await (async () => {
					const publicLink = await getPublicLinkStatus(filen, item.type, item.uuid, item.type === "file" ? item.key : undefined)
					if (publicLink === undefined) { // create
						await filen.cloud().enablePublicLink({ type: item.type, uuid: item.uuid })
						app.out("Public link created:")
						return (await getPublicLinkStatus(filen, item.type, item.uuid, item.type === "file" ? item.key : undefined))!
					} else {
						return publicLink
					}
				})()

				app.out(formatTable([
					["Password:", publicLink.password !== null ? "***" : "<none>"],
					["Download Button:", publicLink.downloadButtonEnabled ? "enabled" : "disabled"],
					...(publicLink.downloadButtonEnabled !== undefined ? [ ["Expiration:", `${publicLink.expiration !== "never" ? formatTimestamp(publicLink.expirationMs) : "-"} (${publicLink.expiration})`] ] : []),
					["Link URL:", publicLink.url],
				]))

				const selection = await app.prompt("Quit (Enter) / Edit (e) / Delete (d): ", { allowExit: true })
				if (selection.toLowerCase() === "e") { // edit
					const password = await app.prompt(`Password (current: ${publicLink.password !== null ? "***" : "<none>"}) [<password>/"-" to remove]: `)
					const downloadButtonEnabled = item.type === "file" ? await app.prompt(`Download button enabled (current: ${publicLink.downloadButtonEnabled ? "y" : "n"}) [y/n]: `) : undefined
					if (downloadButtonEnabled !== undefined && downloadButtonEnabled !== "" && (downloadButtonEnabled.toLowerCase() !== "y" && downloadButtonEnabled.toLowerCase() !== "n")) app.errExit("Invalid input for download button enabled: needs y/n")
					const expiration = await app.prompt(`Expiration (current: ${publicLink.expiration}) [never/1h/6h/1d/3d/7d/14d/30d]: `)
					if (expiration !== "" && !["never", "1h", "6h", "1d", "3d", "7d", "14d", "30d"].includes(expiration)) app.errExit("Invalid input for expiration: needs never/1h/6h/1d/3d/7d/14d/30d")
					if (password !== "" || downloadButtonEnabled !== "" || expiration !== "") {
						await filen.cloud().editPublicLink({
							type: publicLink.type,
							itemUUID: item.uuid,
							linkUUID: publicLink.uuid,
							password: password !== "" ? (password === "-" ? undefined : password) : (publicLink.password ?? undefined),
							enableDownload: item.type === "file" ? downloadButtonEnabled !== "" ? downloadButtonEnabled!.toLowerCase() === "y" : publicLink.downloadButtonEnabled : undefined,
							expiration: expiration !== "" ? expiration as PublicLinkExpiration : publicLink.expiration,
						})
						app.out("Public link updated.")
					}
				}
				if (selection.toLowerCase() === "d") { // delete
					if (item.type === "file") {
						await filen.cloud().disablePublicLink({ type: "file", itemUUID: item.uuid, linkUUID: publicLink.uuid })
					} else {
						await filen.cloud().disablePublicLink({ type: "directory", itemUUID: item.uuid })
					}
					app.out("Public link deleted.")
				}
			}
		})
	]
}