import { version } from "./buildInfo"
import { errExit, out, prompt } from "./interface"
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
		const releaseInfoResponse = await fetch("https://api.github.com/repos/FilenCloudDienste/filen-cli/releases/latest")
		const releaseInfo: ReleaseInfo = await releaseInfoResponse.json()

		const currentVersion = version
		const publishedVersion = releaseInfo.tag_name

		if (currentVersion === "0.0.0") {
			if (verbose) out("Skipping updates in development environment")
			return
		}

		if (currentVersion !== publishedVersion) {
			if ((await prompt(`Update from ${currentVersion} to ${publishedVersion}? [y/N] `)).toLowerCase() === "y") {
				await this.update(releaseInfo)
			}
		} else {
			if (verbose) out(`${currentVersion} is up to date.`)
		}
	}

	private async update(releaseInfo: ReleaseInfo) {
		let platformStr = "linux"
		if (process.platform === "win32") platformStr = "win"
		if (process.platform === "darwin") platformStr = "macos"
		const url = releaseInfo.assets.find(asset => asset.name.includes(platformStr))!.browser_download_url
		const selfApplicationFile = process.pkg === undefined ? __filename : process.argv[0]
		const downloadedFile = path.join(path.dirname(selfApplicationFile), `filen_update_${releaseInfo.tag_name}`)

		out("Downloading update...")
		await downloadFile(url, downloadedFile)

		out("Installing update...")
		if (process.platform === "win32") {
			const commands = [
				`del "${selfApplicationFile}"`,
				`rename "${downloadedFile}" ${path.basename(selfApplicationFile)}`,
				`echo "Successfully updated to ${releaseInfo.tag_name}"`,
				"pause"
			]
			spawn("cmd.exe", ["/c", commands.join(" & ")], { shell: true, detached: true })
			process.exit()
		}
		if (process.platform === "darwin") {
			//TODO implement @Dwynr
		}
		if (process.platform === "linux") {
			const commands = [
				`rm "${selfApplicationFile}"`,
				`chmod +x "${downloadedFile}"`,
				`mv "${downloadedFile}" "${selfApplicationFile}"`,
				`echo "Successfully updated to ${releaseInfo.tag_name}"`,
				"read -p \"Press enter to continue...\""
			]
			spawn("bash", ["-c", `${commands.join(" & ")}`], { detached: true })
			process.exit()
		}
		errExit(`Could not install for platform ${process.platform}`)
	}
}