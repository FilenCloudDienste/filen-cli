import { disableAutomaticUpdates, version } from "./buildInfo"
import { err, errExit, out, outVerbose, promptYesNo } from "./interface/interface"
import path from "path"
import { spawn } from "node:child_process"
import { downloadFile, exists, platformConfigPath } from "./util/util"
import * as fs from "node:fs"
import semver from "semver/preload"

type UpdateCache = {
	lastCheckedUpdate: number
	canary: boolean
}

type ReleaseInfo = {
	id: number
	tag_name: string
	prerelease: boolean
	body: string
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

		const updateCache = await this.readUpdateCache()

		// skip if already recently checked
		if (!force) {
			if (Date.now() - updateCache.lastCheckedUpdate < this.updateCheckExpiration) {
				outVerbose("Checked for updates not long ago, not checking again")
				return
			} else {
				outVerbose("Last update check is too long ago, checking again")
			}
		} else {
			outVerbose("Update check forced")
		}

		// fetch release info
		const fetchGithubAPI = async (url: string) => {
			try {
				const response = await fetch(url)
				return await response.json()
			} catch (e) {
				errExit("fetch update info", e)
			}
		}
		const latestRelease: ReleaseInfo = await fetchGithubAPI("https://api.github.com/repos/FilenCloudDienste/filen-cli/releases/latest")
		const releases: ReleaseInfo[] = await fetchGithubAPI("https://api.github.com/repos/FilenCloudDienste/filen-cli/releases")

		// determine canary release
		const canaryRelease = releases
			.sort((a, b) => semver.compare(a.tag_name, b.tag_name))
			.filter(release => !release.prerelease)
			.reverse()[0]!

		const currentVersion = version
		const latestVersion = latestRelease.tag_name

		const platformStr = (() => {
			switch (process.platform) {
				case "win32": return "win"
				case "darwin": return "macos"
				case "linux": return "linux"
				default: errExit(`Error trying to update on unsupported platform ${process.platform}`)
			}
		})()
		const latestDownloadUrl = latestRelease.assets.find(asset => asset.name.includes(platformStr) && asset.name.includes(process.arch))?.browser_download_url
		const canaryDownloadUrl = canaryRelease.assets.find(asset => asset.name.includes(platformStr) && asset.name.includes(process.arch))?.browser_download_url
		if (disableAutomaticUpdates && latestDownloadUrl !== undefined && currentVersion !== latestVersion) {
			out(`${(semver.gt(latestVersion, currentVersion) ? "Update available" : "Other version recommended")}: ${currentVersion} -> ${latestVersion}`)
			return
		}
		if (latestDownloadUrl !== undefined) {
			if (semver.gt(latestVersion, currentVersion)) {
				if (await promptYesNo(`Update from ${currentVersion} to ${latestVersion}?`)) {
					await this.installVersion(currentVersion, latestVersion, latestDownloadUrl)
				}
			} else if (semver.lt(latestVersion, currentVersion)) {
				// current version is higher than latest version
				if (releases.filter(release => release.tag_name === currentVersion).length === 0) {
					// current version doesn't exist as release, so it was intentionally deleted to prompt for downgrade
					if (updateCache.canary && canaryDownloadUrl !== undefined) {
						if (await promptYesNo(`It is recommended to downgrade from ${currentVersion} to${latestVersion === canaryRelease.tag_name ? "" : " canary release"} ${canaryRelease.tag_name}. Please confirm:`, true)) {
							await this.installVersion(currentVersion, canaryRelease.tag_name, canaryDownloadUrl)
						}
					} else {
						if (await promptYesNo(`It is recommended to downgrade from ${currentVersion} to ${latestVersion}. Please confirm:`, true)) {
							await this.installVersion(currentVersion, latestVersion, latestDownloadUrl)
						}
					}
				}
				if (updateCache.canary) {
					if (canaryDownloadUrl !== undefined && semver.gt(canaryRelease.tag_name, currentVersion)) {
						if (await promptYesNo(`Update from ${currentVersion} to canary release ${canaryRelease.tag_name}?`)) {
							await this.installVersion(currentVersion, canaryRelease.tag_name, canaryDownloadUrl)
						}
					} else {
						outVerbose(`${currentVersion} is up to date.`)
					}
				} else {
					// current version exists as release, so this canary version was downloaded manually
					out(`It seems you have downloaded this canary release ${currentVersion} manually (latest is ${latestVersion}).\nPlease invoke \`filen canary\` to remove this warning and get notified of new canary releases.\nIf this wasn't intentional, invoke \`filen install ${latestVersion}\` to install the latest version.`)
				}
			} else {
				outVerbose(`${currentVersion} is up to date.`)
			}
		} else {
			outVerbose(`${currentVersion} is up to date.`)
		}

		// save update cache
		await this.writeUpdateCache({ ...updateCache, lastCheckedUpdate: Date.now() })
	}

	private async readUpdateCache(): Promise<UpdateCache> {
		if (await exists(this.updateCacheFile)) {
			try {
				const content = await (async () => {
					try {
						return (await fs.promises.readFile(this.updateCacheFile)).toString()
					} catch (e) {
						throw new Error("unable to read update cache file")
					}
				})()
				const updateCache = (() => {
					try {
						return JSON.parse(content)
					} catch (e) {
						throw new Error("unable to parse update cache file")
					}
				})()
				if (typeof updateCache.lastCheckedUpdate !== "number") throw new Error("malformed update cache file")
				return {
					lastCheckedUpdate: updateCache.lastCheckedUpdate,
					canary: updateCache.canary ?? false
				}
			} catch (e) {
				err("read recent update checks", e, "invoke the CLI again to retry updating")
				try {
					await fs.promises.rm(this.updateCacheFile)
				} catch (e) {
					errExit("delete update cache file", e)
				}
			}
		}
		return {
			lastCheckedUpdate: 0,
			canary: false
		}
	}

	private async writeUpdateCache(updateCache: UpdateCache) {
		if (!await exists(this.updateCacheDirectory)) {
			await fs.promises.mkdir(this.updateCacheDirectory)
		}
		await fs.promises.writeFile(this.updateCacheFile, JSON.stringify(updateCache))
	}

	public async showCanaryPrompt() {
		const updateCache = await this.readUpdateCache()
		if (updateCache.canary) {
			out("Canary releases are enabled.")
			if (await promptYesNo("Disable canary releases?", false)) {
				await this.writeUpdateCache({ ...updateCache, canary: false })
			}
		} else {
			out("You are about to enable canary releases, which are early releases meant for a subset of users to test before they are declared as stable.\n" +
				"You might encounter bugs or crashes, so please do not use this in production. Report bugs on GitHub: https://github.com/FilenCloudDienste/filen-cli/issues\n" +
				"To install the latest stable version again, invoke the CLI with the command `filen install latest`. To disable canary releases altogether, call `filen canary` again.")
			if (await promptYesNo("Enable canary releases?")) {
				await this.writeUpdateCache({ ...updateCache, canary: true })
			}
		}
	}

	public async fetchAndInstallVersion(version: string | "latest") {
		// fetch version info
		const fetchGithubAPI = async (url: string) => {
			try {
				const response = await fetch(url)
				return await response.json()
			} catch (e) {
				errExit("fetch update info", e)
			}
		}
		const latestRelease: ReleaseInfo = await fetchGithubAPI("https://api.github.com/repos/FilenCloudDienste/filen-cli/releases/latest")
		const releases: ReleaseInfo[] = await fetchGithubAPI("https://api.github.com/repos/FilenCloudDienste/filen-cli/releases")

		const release = version === "latest" ? latestRelease : releases.find(release => release.tag_name === version)
		if (release === undefined) {
			errExit(`No such version: ${version}`)
		}

		const platformStr = (() => {
			switch (process.platform) {
				case "win32": return "win"
				case "darwin": return "macos"
				case "linux": return "linux"
				default: errExit(`Error trying to update on unsupported platform ${process.platform}`)
			}
		})()
		const downloadUrl = release.assets.find(asset => asset.name.includes(platformStr) && asset.name.includes(process.arch))?.browser_download_url
		if (downloadUrl === undefined) errExit(`Unsupported platform ${process.platform} for version ${version}`)
		if (await promptYesNo(`Download and install ${version}?`)) {
			await this.installVersion(version, release.tag_name, downloadUrl)
		}
	}

	private async installVersion(currentVersionName: string, publishedVersionName: string, downloadUrl: string) {
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
			spawn("cmd.exe", ["/c", "\"" + commands.join(" & ").replace(/"/g, "\"\"\"") + "\""], { shell: true, detached: true })
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