import { version, disableAutomaticUpdates } from "./buildInfo"
import { errExit, out, prompt } from "./interface/interface"
import path from "path"
import { spawn } from "node:child_process"
import { downloadFile } from "./util"

type ReleaseInfo = {
	tag_name: string
	assets: {
		name: string
		browser_download_url: string
	}[]
}

/**
 * Checks for updates and installs updates.
 */
export class Updater {
	/**
	 * Check for updates and prompt the user on whether to update.
	 */
	public async checkForUpdates(verbose: boolean): Promise<void> {
		if (version === "0.0.0") {
			if (verbose) out("Skipping updates in development environment")
			return
		}

		const releaseInfoResponse = await fetch("https://api.github.com/repos/FilenCloudDienste/filen-cli/releases/latest")
		const releaseInfo: ReleaseInfo = await releaseInfoResponse.json()

		const currentVersion = version
		const publishedVersion = releaseInfo.tag_name

		let platformStr = "linux"
		if (process.platform === "win32") platformStr = "win"
		if (process.platform === "darwin") platformStr = "macos"
		const downloadUrl = releaseInfo.assets.find(asset => asset.name.includes(platformStr) && asset.name.includes(process.arch))?.browser_download_url ?? undefined
		if (downloadUrl !== undefined && currentVersion !== publishedVersion) {
			if (disableAutomaticUpdates) {
				out(`Update available: ${currentVersion} -> ${publishedVersion}`)
				return
			}

			if ((await prompt(`Update from ${currentVersion} to ${publishedVersion}? [y/N] `)).toLowerCase() === "y") {
				await this.update(downloadUrl, releaseInfo.tag_name)
			}
		} else {
			if (verbose) out(`${currentVersion} is up to date.`)
		}
	}

	private async update(downloadUrl: string, publishedVersion: string) {
		const selfApplicationFile = process.pkg === undefined ? __filename : process.argv[0]!
		const downloadedFile = path.join(path.dirname(selfApplicationFile), `filen_update_${publishedVersion}`)

		out("Downloading update...")
		await downloadFile(downloadUrl, downloadedFile)

		out("Installing update...")
		if (process.platform === "win32") {
			const commands = [
				`del "${selfApplicationFile}"`,
				`rename "${downloadedFile}" ${path.basename(selfApplicationFile)}`,
				`echo "Successfully updated to ${publishedVersion}"`,
				"pause"
			]
			spawn("cmd.exe", ["/c", commands.join(" & ")], { shell: true, detached: true })
			process.exit()
		}
		if (process.platform === "linux" || process.platform === "darwin") {
			const commands = [
				`rm "${selfApplicationFile}"`,
				`chmod +x "${downloadedFile}"`,
				`mv "${downloadedFile}" "${selfApplicationFile}"`,
				`echo "Successfully updated to ${publishedVersion}"`,
				"read -p \"Press enter to continue...\""
			]
			spawn("sh", ["-c", `${commands.join(" & ")}`], { detached: true })
			process.exit()
		}
		errExit(`Could not install for platform ${process.platform}`)
	}
}