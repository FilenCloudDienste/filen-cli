import { isRunningAsContainer, isRunningAsNPMPackage, version } from "./buildInfo"
import { err, errExit, out, outVerbose, promptYesNo } from "./interface/interface"
import path from "path"
import { spawn } from "node:child_process"
import { downloadFile, exists } from "./util/util"
import * as fs from "node:fs"
import semver from "semver/preload"
import { dataDir } from "."

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
 * Manages updates.
 */
export class Updater {
	private readonly updateCacheDirectory = dataDir
	private readonly updateCacheFile = path.join(this.updateCacheDirectory, "updateCache.json")
	private readonly updateCheckExpiration = 10 * 60 * 1000 // check again after 10min

	/**
	 * Check for updates and prompt the user on whether to update.
	 * @param forceUpdateCheck the `--force-update` CLI argument
	 * @param autoUpdate the `--auto-update` CLI argument
	 */
	public async checkForUpdates(forceUpdateCheck: boolean, autoUpdate: boolean): Promise<void> {
		if (isRunningAsNPMPackage) {
			await this.checkNPMRegistryForUpdates()
			return
		}

		if ((process.pkg === undefined ? __filename : process.argv[0]!).endsWith(".js")) {
			outVerbose("Skipping updates for non-binary installation")
			return
		}

		if (version === "0.0.0") {
			outVerbose("Skipping updates in development environment")
			return
		}

		const updateCache = await this.readUpdateCache()

		// skip if already recently checked
		if (!forceUpdateCheck) {
			if (Date.now() - updateCache.lastCheckedUpdate < this.updateCheckExpiration) {
				outVerbose("Checked for updates not long ago, not checking again")
				return
			} else {
				outVerbose("Last update check is too long ago, checking again")
			}
		} else {
			outVerbose("Update check forced")
		}

		const { releases, latestRelease, canaryRelease } = await this.fetchReleaseInfo()
		const latestDownloadUrl = this.getDownloadUrl(latestRelease)
		const canaryDownloadUrl = this.getDownloadUrl(canaryRelease)

		const currentVersion = version
		const latestVersion = latestRelease.tag_name

		if (isRunningAsContainer && latestDownloadUrl !== undefined && currentVersion !== latestVersion) {
			// don't prompt for update in a container environment
			out(`${(semver.gt(latestVersion, currentVersion) ? "Update available" : "Other version recommended")}: ${currentVersion} -> ${latestVersion}`)
			return
		}
		if (releases.filter(release => release.tag_name === currentVersion).length === 0) {
			// current version doesn't exist as release, so it was intentionally deleted to prompt for downgrade
			if (updateCache.canary && canaryDownloadUrl !== undefined) {
				if (autoUpdate || await promptYesNo(`It is highly recommended to ${semver.gt(currentVersion, canaryRelease.tag_name) ? "downgrade" : "update"} from ${currentVersion} to${latestVersion === canaryRelease.tag_name ? "" : " canary release"} ${canaryRelease.tag_name}. Please confirm:`, true)) {
					out(`${semver.gt(currentVersion, canaryRelease.tag_name) ? "Downgrading" : "Updating"} from ${currentVersion} to${latestVersion === canaryRelease.tag_name ? "" : " canary release"} ${canaryRelease.tag_name}...`)
					await this.showChangelogs(releases, canaryRelease.tag_name, autoUpdate)
					await this.installVersion(currentVersion, canaryRelease.tag_name, canaryDownloadUrl)
				}
			} else if (latestDownloadUrl !== undefined) {
				if (autoUpdate || await promptYesNo(`It is highly recommended to ${semver.gt(currentVersion, latestVersion) ? "downgrade" : "update"} from ${currentVersion} to ${latestVersion}. Please confirm:`, true)) {
					out(`${semver.gt(currentVersion, latestVersion) ? "Downgrading" : "Updating"} from ${currentVersion} to ${latestVersion}...`)
					await this.showChangelogs(releases, latestVersion, autoUpdate)
					await this.installVersion(currentVersion, latestVersion, latestDownloadUrl)
				}
			} else {
				out("It is highly recommended to update to a newer version, but none could be found. Please try to reinstall the CLI.")
			}
			return
		}
		if (semver.gt(latestVersion, currentVersion) && latestDownloadUrl !== undefined) {
			if (autoUpdate || await promptYesNo(`Update from ${currentVersion} to ${latestVersion}?`)) {
				out(`Updating from ${currentVersion} to ${latestVersion}...`)
				await this.showChangelogs(releases, latestVersion, autoUpdate)
				await this.installVersion(currentVersion, latestVersion, latestDownloadUrl)
			}
		} else {
			if (updateCache.canary) {
				if (canaryDownloadUrl !== undefined && semver.gt(canaryRelease.tag_name, currentVersion)) {
					if (autoUpdate || await promptYesNo(`Update from ${currentVersion} to canary release ${canaryRelease.tag_name}?`)) {
						out(`Updating from ${currentVersion} to canary release ${canaryRelease.tag_name}...`)
						await this.showChangelogs(releases, canaryRelease.tag_name, autoUpdate)
						await this.installVersion(currentVersion, canaryRelease.tag_name, canaryDownloadUrl)
					}
				} else {
					outVerbose(`${currentVersion} is up to date.`)
				}
			} else {
				if (semver.gt(currentVersion, latestVersion)) {
					// this canary version seems to have been downloaded manually
					out(`It seems you have downloaded this canary release ${currentVersion} manually (latest is ${latestVersion}).\n` +
						"Please invoke `filen canary` to remove this warning and get notified of new canary releases.\n" +
						"If this wasn't intentional, invoke `filen install latest` to install the latest version.")
				} else {
					outVerbose(`${currentVersion} is up to date.`)
				}
			}
		}

		// save update cache
		await this.writeUpdateCache({ ...updateCache, lastCheckedUpdate: Date.now() })
	}

	private async checkNPMRegistryForUpdates() {
		try {
			const response = await fetch("https://registry.npmjs.org/@filen/cli")
			if (response.status !== 200) throw new Error(`NPM registry API returned status ${response.status} ${response.statusText}`)
			const data = await response.json()

			const latestVersion = data["dist-tags"]["latest"]
			if (latestVersion === undefined) throw new Error("latest version not found in NPM registry response")
			if (semver.neq(latestVersion, version)) {
				out(`Update available: ${version} -> v${latestVersion} (install via npm i -g @filen/cli@latest)`)
			} else {
				outVerbose(`${version} is up to date.`)
			}
		} catch (e) {
			errExit("check NPM registry for updates", e)
		}
	}

	/**
	 * Shows a prompt to the user to enable or disable canary releases.
	 */
	public async showCanaryPrompt() {
		const updateCache = await this.readUpdateCache()
		if (updateCache.canary) {
			out("Canary releases are enabled.")
			if (await promptYesNo("Disable canary releases?", false)) {
				await this.writeUpdateCache({ ...updateCache, canary: false })
				out("Canary releases disabled. If you wish to rollback to the latest stable version, invoke `filen install latest`.")
			}
		} else {
			out("You are about to enable canary releases, which are early releases meant for a subset of users to test before they are declared as stable.\n" +
				"You might encounter bugs or crashes, so please do not use this in production. Report bugs on GitHub: https://github.com/FilenCloudDienste/filen-cli/issues\n" +
				"To install the latest stable version again, invoke the CLI with the command `filen install latest`. To disable canary releases altogether, call `filen canary` again.")
			if (await promptYesNo("Enable canary releases?")) {
				await this.writeUpdateCache({ ...updateCache, canary: true })
				out("Canary releases enabled.")

				const { releases, canaryRelease } = await this.fetchReleaseInfo()
				const downloadUrl = this.getDownloadUrl(canaryRelease)
				if (semver.gt(canaryRelease.tag_name, version) && downloadUrl !== undefined) {
					if (await promptYesNo(`Install the latest canary release ${canaryRelease.tag_name} now?`)) {
						await this.showChangelogs(releases, canaryRelease.tag_name, false)
						await this.installVersion(version, canaryRelease.tag_name, downloadUrl)
					}
				}
			}
		}
	}

	/**
	 * Downloads and installs any specified version.
	 * @param version The specific version to install, or "latest" or "canary".
	 */
	public async fetchAndInstallVersion(version: string | "latest" | "canary") {
		const { releases, latestRelease, canaryRelease } = await this.fetchReleaseInfo()
		const release = (() => {
			switch (version) {
				case "latest": return latestRelease
				case "canary": return canaryRelease
				default: return releases.find(release => release.tag_name === version)
			}
		})()
		if (release === undefined) errExit(`No such version: ${version}`)
		const downloadUrl = this.getDownloadUrl(release)
		if (downloadUrl === undefined) errExit(`Unsupported platform ${process.platform} for version ${release.tag_name}`)
		if (await promptYesNo(`Download and install ${release.tag_name}?`)) {
			await this.installVersion(version, release.tag_name, downloadUrl)
		}
	}

	// update cache

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

	// release info

	private async fetchReleaseInfo(): Promise<{ releases: ReleaseInfo[], latestRelease: ReleaseInfo, canaryRelease: ReleaseInfo }> {
		const fetchGithubAPI = async (url: string) => {
			try {
				const response = await fetch(url)
				if (response.status !== 200) throw new Error(`Error trying to fetch update info: GitHub API returned status ${response.status} ${response.statusText}`)
				return await response.json()
			} catch (e) {
				errExit("fetch update info", e)
			}
		}
		const latestRelease: ReleaseInfo = await fetchGithubAPI("https://api.github.com/repos/FilenCloudDienste/filen-cli/releases/latest")
		const releases: ReleaseInfo[] = await fetchGithubAPI("https://api.github.com/repos/FilenCloudDienste/filen-cli/releases")
		const canaryRelease = releases.sort((a, b) => semver.compare(a.tag_name, b.tag_name)).filter(release => !release.prerelease).reverse()[0]!
		return { releases, latestRelease, canaryRelease }
	}

	private getDownloadUrl(release: ReleaseInfo) {
		const platformStr = (() => {
			switch (process.platform) {
				case "win32": return "win"
				case "darwin": return "macos"
				case "linux": return "linux"
				default: errExit(`Error trying to update on unsupported platform ${process.platform}`)
			}
		})()
		return release.assets.find(asset => asset.name.includes(platformStr) && asset.name.includes(process.arch))?.browser_download_url
	}

	// install
	
	private async showChangelogs(releases: ReleaseInfo[], targetRelease: string, skipConfirmation: boolean) {
		if (semver.lt(targetRelease, version)) return
		if (skipConfirmation || await promptYesNo("Show changelogs?", true)) {
			const passingReleases = releases.sort((a, b) => semver.compare(a.tag_name, b.tag_name)).filter(release => semver.gt(release.tag_name, version) && semver.lte(release.tag_name, targetRelease) && !release.prerelease)
			const releaseBodies = passingReleases.map(release => `========== ${release.tag_name} ==========\n${release.body}\n${"=".repeat(22 + release.tag_name.length)}`)
			out("\n\n" + releaseBodies.join("\n\n\n") + "\n\n")
		}
	}

	private async installVersion(currentVersionName: string, publishedVersionName: string, downloadUrl: string) {
		const selfApplicationFile = process.pkg === undefined ? __filename : process.argv[0]!
		if (selfApplicationFile.endsWith(".js")) errExit("Updater only supported for CLI binaries")
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