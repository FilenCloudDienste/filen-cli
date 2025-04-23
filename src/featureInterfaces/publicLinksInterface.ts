import FilenSDK, { PublicLinkExpiration } from "@filen/sdk"
import { formatTable, formatTimestamp } from "../interface/util"
import { getItemPaths } from "../util/util"
import { App } from "../app"

/**
 * Provides the interface for managing public links.
 */
export class PublicLinksInterface {
	constructor(private app: App, private filen: FilenSDK) {}

	public async invoke(args: string[]) {
		if (args.length === 0 || args[0] === "list" || args[0] === "ls") {
			try {
				await this.listPublicLinks()
			} catch (e) {
				this.app.errExit("list public links", e)
			}
		} else {
			if (args.length > 1) this.app.errExit("Invalid usage! See `filen -h fs` for more info.")
			try {
				await this.editPublicLink(args[0]!)
			} catch (e) {
				if (e instanceof Error && e.message.includes("upgrade your account to use this feature")) {
					this.app.errExit("Subscription needed for public links. Upgrade to any pro plan to use this feature.")
				}
				this.app.errExit("edit public link", e)
			}
		}
		process.exit()
	}

	private async listPublicLinks() {
		const items = await this.filen.cloud().listPublicLinks()
		const itemsWithPath = await getItemPaths(this.filen, items)
		if (itemsWithPath.length > 0) {
			this.app.out(formatTable(await Promise.all(itemsWithPath.map(async item => {
				const publicLink = (await this.getPublicLinkStatus(item.type, item.uuid, item.type === "file" ? item.key : undefined))!
				return [item.path, publicLink.url]
			}))))
		} else {
			this.app.out("No public links yet.")
		}
	}

	private async editPublicLink(path: string) {
		const item = await (async () => {
			try {
				return await this.filen.fs().stat({ path })
			} catch (e) {
				if (e instanceof Error && e.name === "FileNotFoundError") this.app.errExit("No such file or directory")
				else throw e
			}
		})()
		const publicLink = await (async () => {
			const publicLink = await this.getPublicLinkStatus(item.type, item.uuid, item.type === "file" ? item.key : undefined)
			if (publicLink === undefined) { // create
				await this.filen.cloud().enablePublicLink({ type: item.type, uuid: item.uuid })
				this.app.out("Public link created:")
				return (await this.getPublicLinkStatus(item.type, item.uuid, item.type === "file" ? item.key : undefined))!
			} else {
				return publicLink
			}
		})()

		this.app.out(formatTable([
			["Password:", publicLink.password !== null ? "***" : "<none>"],
			["Download Button:", publicLink.downloadButtonEnabled ? "enabled" : "disabled"],
			...(publicLink.downloadButtonEnabled !== undefined ? [ ["Expiration:", `${publicLink.expiration !== "never" ? formatTimestamp(publicLink.expirationMs) : "-"} (${publicLink.expiration})`] ] : []),
			["Link URL:", publicLink.url],
		]))

		const selection = await this.app.prompt("Quit (Enter) / Edit (e) / Delete (d): ", { allowExit: true })
		if (selection.toLowerCase() === "e") { // edit
			const password = await this.app.prompt(`Password (current: ${publicLink.password !== null ? "***" : "<none>"}) [<password>/"-" to remove]: `)
			const downloadButtonEnabled = item.type === "file" ? await this.app.prompt(`Download button enabled (current: ${publicLink.downloadButtonEnabled ? "y" : "n"}) [y/n]: `) : undefined
			if (downloadButtonEnabled !== undefined && downloadButtonEnabled !== "" && (downloadButtonEnabled.toLowerCase() !== "y" && downloadButtonEnabled.toLowerCase() !== "n")) this.app.errExit("Invalid input for download button enabled: needs y/n")
			const expiration = await this.app.prompt(`Expiration (current: ${publicLink.expiration}) [never/1h/6h/1d/3d/7d/14d/30d]: `)
			if (expiration !== "" && !["never", "1h", "6h", "1d", "3d", "7d", "14d", "30d"].includes(expiration)) this.app.errExit("Invalid input for expiration: needs never/1h/6h/1d/3d/7d/14d/30d")
			if (password !== "" || downloadButtonEnabled !== "" || expiration !== "") {
				await this.filen.cloud().editPublicLink({
					type: publicLink.type,
					itemUUID: item.uuid,
					linkUUID: publicLink.uuid,
					password: password !== "" ? (password === "-" ? undefined : password) : (publicLink.password ?? undefined),
					enableDownload: item.type === "file" ? downloadButtonEnabled !== "" ? downloadButtonEnabled!.toLowerCase() === "y" : publicLink.downloadButtonEnabled : undefined,
					expiration: expiration !== "" ? expiration as PublicLinkExpiration : publicLink.expiration,
				})
				this.app.out("Public link updated.")
			}
		}
		if (selection.toLowerCase() === "d") { // delete
			if (item.type === "file") {
				await this.filen.cloud().disablePublicLink({ type: "file", itemUUID: item.uuid, linkUUID: publicLink.uuid })
			} else {
				await this.filen.cloud().disablePublicLink({ type: "directory", itemUUID: item.uuid })
			}
			this.app.out("Public link deleted.")
		}
	}

	private async getPublicLinkStatus(type: "file" | "directory", uuid: string, fileKey: string | undefined): Promise<{
		type: "file" | "directory"
		uuid: string
		password: string | null
		downloadButtonEnabled: boolean | undefined
		expirationMs: number
		expiration: PublicLinkExpiration
		url: string
	}|undefined> {
		if (type === "directory") {
			const publicLinkStatus = await this.filen.cloud().publicLinkStatus({ type: "directory", uuid })
			if (!publicLinkStatus.exists) return undefined
			const key = await this.filen.crypto().decrypt().folderLinkKey({ metadata: publicLinkStatus.key })
			return {
				type: "directory",
				uuid: publicLinkStatus.uuid,
				password: publicLinkStatus.password,
				downloadButtonEnabled: undefined,
				expirationMs: publicLinkStatus.expiration! * 1000,
				expiration: publicLinkStatus.expirationText as PublicLinkExpiration,
				url: `https://drive.filen.io/f/${publicLinkStatus.uuid}#${key}`
			}
		} else {
			const publicLinkStatus = await this.filen.cloud().publicLinkStatus({ type: "file", uuid })
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
}