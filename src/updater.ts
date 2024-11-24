import { disableAutomaticUpdates, version } from "./buildInfo"
import { err, errExit, out, outVerbose, prompt } from "./interface/interface"
import path from "path"
import { spawn } from "node:child_process"
import { downloadFile, exists, platformConfigPath } from "./util/util"
import * as fs from "node:fs"

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
	private readonly updateCacheDirectory = platformConfigPath()
	private readonly updateCacheFile = path.join(this.updateCacheDirectory, "updateCache.json")
	private readonly updateCheckExpiration = 10 * 60 * 1000 // check again after 10min

	/**
	 * Check for updates and prompt the user on whether to update.
	 */
	public async checkForUpdates(force: boolean): Promise<void> {
		if (version === "0.0.0") {
			outVerbose("Skipping updates in development environment")
			return
		}

		// skip if already recently checked
		if (!force) {
			if (await exists(this.updateCacheFile)) {
				try {
					const content = (await fs.promises.readFile(this.updateCacheFile)).toString()
					const updateCache = (() => {
						try {
							return JSON.parse(content)
						} catch (e) {
							throw new Error("unable to parse update cache file")
						}
					})()
					if (typeof updateCache.lastCheckedUpdate !== "number") throw new Error("malformed update cache file")
					if (Date.now() - updateCache.lastCheckedUpdate < this.updateCheckExpiration) {
						outVerbose("Checked for updates not long ago, not checking again")
						return
					} else {
						outVerbose("Last update check is too long ago, checking again")
					}
				} catch (e) {
					err("read recent update checks", e, "invoke the CLI again to retry updating")
					try {
						await fs.promises.rm(this.updateCacheFile)
					} catch (e) {
						errExit("delete update cache file", e)
					}
					return
				}
			}
		} else {
			outVerbose("Update check forced")
		}

		const releaseInfoResponse = await (async () => {
			try {
				return await fetch("https://api.github.com/repos/FilenCloudDienste/filen-cli/releases/latest")
			} catch (e) {
				errExit("fetch update info", e)
			}
		})()
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
				await this.update(currentVersion, publishedVersion, downloadUrl)
			}
		} else {
			outVerbose(`${currentVersion} is up to date.`)
		}

		// save update cache
		(async () => {
			if (!await exists(this.updateCacheDirectory)) {
				await fs.promises.mkdir(this.updateCacheDirectory)
			}
			await fs.promises.writeFile(this.updateCacheFile, JSON.stringify({ lastCheckedUpdate: Date.now() }))
		})()
	}

	private async update(currentVersionName: string, publishedVersionName: string, downloadUrl: string) {
		const selfApplicationFile = process.pkg === undefined ? __filename : process.argv[0]!
		const downloadedFile = path.join(path.dirname(selfApplicationFile), `filen_update_${publishedVersionName}`)

		out("Downloading update...")
		try {
			await downloadFile(downloadUrl, downloadedFile)
		} catch (e) {
			errExit("download update", e)
		}

		out("Installing update...")
		if (process.platform === "win32") {
			const newFileName = path.basename(selfApplicationFile).replace(currentVersionName, publishedVersionName)
			if (path.basename(selfApplicationFile).includes(currentVersionName)) out(`Use the new version using the command: ${newFileName}`)
			const commands = [
				"echo Installing update...",
				"ping 127.0.0.1 -n 2 > nul", // wait 2 seconds
				`del "${selfApplicationFile}"`,
				`rename "${downloadedFile}" ${newFileName}`,
				`echo Successfully updated to ${publishedVersionName}`,
				...(path.basename(selfApplicationFile).includes(currentVersionName) ? [`echo Use the new version using the command: ${newFileName}`] : []),
				"pause"
			]
			// for " escaping, see https://stackoverflow.com/a/15262019/13164753
			spawn("cmd.exe", ["/c", "\"" + commands.join(" & ").replace(/"/, "\"\"\"") + "\""], { shell: true, detached: true })
			process.exit()
		}
		if (process.platform === "linux" || process.platform === "darwin") {
			const newFileName = selfApplicationFile.replace(currentVersionName, publishedVersionName)
			if (selfApplicationFile.includes(currentVersionName)) out(`Use the new version using the command: ${newFileName}`)
			const commands = [
				`rm "${selfApplicationFile}"`,
				`chmod +x "${downloadedFile}"`,
				`mv "${downloadedFile}" "${newFileName}"`,
				`echo "Successfully updated to ${publishedVersionName}"`,
				...(path.basename(selfApplicationFile).includes(currentVersionName) ? [`echo "Use the new version using the command: ${path.basename(selfApplicationFile).replace(currentVersionName, publishedVersionName)}"`] : []),
				"read -p \"Press enter to continue...\""
			]
			spawn("sh", ["-c", `${commands.join(" & ")}`], { detached: true })
			process.exit()
		}
		errExit(`Could not install for platform ${process.platform}`)
	}
}