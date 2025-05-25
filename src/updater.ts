import { isRunningAsContainer, isRunningAsNPMPackage, version } from "./buildInfo"
import path from "path"
import { spawn } from "node:child_process"
import { downloadFile, exists } from "./util/util"
import * as fs from "node:fs"
import semver from "semver"
import { App } from "./app"
import dedent from "dedent"
import { helpText } from "./interface/helpPage"
import { ArgumentType, feature, FeatureContext } from "./features"

export const updateHelpText = helpText({
	title: "Updates",
	name: "updates",
	text: dedent`
		The automatic updater checks for new releases every time the CLI is invoked.
		
		After checking for updates, it will not check again for the next 10 minutes. Use the flags:
			--force-update  to check for updates even if it was recently checked.
			--skip-update   to skip checking for updates.
			--auto-update   to skip the confirmation prompt and update automatically (will still abort after updating).
		
		You can always install any version using \`filen install <version>\`, \`filen install latest\` or \`filen install canary\`.
		
		If you want to be among the first to try out new features and fixes, you can enable canary releases,
		which are early releases meant for a subset of users to test before they are declared as stable.
		To enable or disable canary releases, invoke the CLI with the command \`filen canary\`.
	`
})

export const canaryCommand = feature({
	cmd: ["canary"],
	description: "Change canary preference.",
	invoke: async ({ app }) => new Updater(app).showCanaryPrompt()
})

export const installCommand = feature({
	cmd: ["install"],
	args: {
		version: { type: ArgumentType.any }
	},
	description: "Install a specific version of the Filen CLI.",
	invoke: async ({ app, args }) => new Updater(app).fetchAndInstallVersion(args.version)
})

export async function runUpdater({ app, cliArgs }: FeatureContext) {
	if (cliArgs["--skip-update"]) {
		app.outVerbose("Update check skipped")
		return
	}
	try {
		await new Updater(app).checkForUpdates(cliArgs["--force-update"] ?? false, cliArgs["--auto-update"] ?? false)
	} catch (e) {
		app.errExit("check for updates", e)
	}
}

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
class Updater {
	private readonly updateCacheDirectory = this.app.dataDir
	private readonly updateCacheFile = path.join(this.updateCacheDirectory, "updateCache.json")
	private readonly updateCheckExpiration = 10 * 60 * 1000 // check again after 10min
	
	constructor(private app: App) {}

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
			this.app.outVerbose("Skipping updates for non-binary installation")
			return
		}

		if (version === "0.0.0") {
			this.app.outVerbose("Skipping updates in development environment")
			return
		}

		const updateCache = await this.readUpdateCache()

		// skip if already recently checked
		if (!forceUpdateCheck) {
			if (Date.now() - updateCache.lastCheckedUpdate < this.updateCheckExpiration) {
				this.app.outVerbose("Checked for updates not long ago, not checking again")
				return
			} else {
				this.app.outVerbose("Last update check is too long ago, checking again")
			}
		} else {
			this.app.outVerbose("Update check forced")
		}

		const { releases, latestRelease, canaryRelease } = await this.fetchReleaseInfo()
		const latestDownloadUrl = this.getDownloadUrl(latestRelease)
		const canaryDownloadUrl = this.getDownloadUrl(canaryRelease)

		const currentVersion = version
		const latestVersion = latestRelease.tag_name

		if (isRunningAsContainer && latestDownloadUrl !== undefined && currentVersion !== latestVersion) {
			// don't prompt for update in a container environment
			this.app.out(`${(semver.gt(latestVersion, currentVersion) ? "Update available" : "Other version recommended")}: ${currentVersion} -> ${latestVersion}`)
			return
		}
		if (releases.filter(release => release.tag_name === currentVersion).length === 0) {
			// current version doesn't exist as release, so it was intentionally deleted to prompt for downgrade
			if (updateCache.canary && canaryDownloadUrl !== undefined) {
				if (autoUpdate || await this.app.promptYesNo(`It is highly recommended to ${semver.gt(currentVersion, canaryRelease.tag_name) ? "downgrade" : "update"} from ${currentVersion} to${latestVersion === canaryRelease.tag_name ? "" : " canary release"} ${canaryRelease.tag_name}. Please confirm:`, { defaultAnswer: true })) {
					this.app.out(`${semver.gt(currentVersion, canaryRelease.tag_name) ? "Downgrading" : "Updating"} from ${currentVersion} to${latestVersion === canaryRelease.tag_name ? "" : " canary release"} ${canaryRelease.tag_name}...`)
					await this.showChangelogs(releases, canaryRelease.tag_name, autoUpdate)
					await this.installVersion(currentVersion, canaryRelease.tag_name, canaryDownloadUrl)
				}
			} else if (latestDownloadUrl !== undefined) {
				if (autoUpdate || await this.app.promptYesNo(`It is highly recommended to ${semver.gt(currentVersion, latestVersion) ? "downgrade" : "update"} from ${currentVersion} to ${latestVersion}. Please confirm:`, { defaultAnswer: true })) {
					this.app.out(`${semver.gt(currentVersion, latestVersion) ? "Downgrading" : "Updating"} from ${currentVersion} to ${latestVersion}...`)
					await this.showChangelogs(releases, latestVersion, autoUpdate)
					await this.installVersion(currentVersion, latestVersion, latestDownloadUrl)
				}
			} else {
				this.app.out("It is highly recommended to update to a newer version, but none could be found. Please try to reinstall the CLI.")
			}
			return
		}
		if (semver.gt(latestVersion, currentVersion) && latestDownloadUrl !== undefined) {
			if (autoUpdate || await this.app.promptYesNo(`Update from ${currentVersion} to ${latestVersion}?`)) {
				this.app.out(`Updating from ${currentVersion} to ${latestVersion}...`)
				await this.showChangelogs(releases, latestVersion, autoUpdate)
				await this.installVersion(currentVersion, latestVersion, latestDownloadUrl)
			}
		} else {
			if (updateCache.canary) {
				if (canaryDownloadUrl !== undefined && semver.gt(canaryRelease.tag_name, currentVersion)) {
					if (autoUpdate || await this.app.promptYesNo(`Update from ${currentVersion} to canary release ${canaryRelease.tag_name}?`)) {
						this.app.out(`Updating from ${currentVersion} to canary release ${canaryRelease.tag_name}...`)
						await this.showChangelogs(releases, canaryRelease.tag_name, autoUpdate)
						await this.installVersion(currentVersion, canaryRelease.tag_name, canaryDownloadUrl)
					}
				} else {
					this.app.outVerbose(`${currentVersion} is up to date.`)
				}
			} else {
				if (semver.gt(currentVersion, latestVersion)) {
					// this canary version seems to have been downloaded manually
					this.app.out(`It seems you have downloaded this canary release ${currentVersion} manually (latest is ${latestVersion}).\n` +
						"Please invoke `filen canary` to remove this warning and get notified of new canary releases.\n" +
						"If this wasn't intentional, invoke `filen install latest` to install the latest version.")
				} else {
					this.app.outVerbose(`${currentVersion} is up to date.`)
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
				this.app.out(`Update available: ${version} -> v${latestVersion} (install via npm i -g @filen/cli@latest)`)
			} else {
				this.app.outVerbose(`${version} is up to date.`)
			}
		} catch (e) {
			this.app.errExit("check NPM registry for updates", e)
		}
	}

	/**
	 * Shows a prompt to the user to enable or disable canary releases.
	 */
	public async showCanaryPrompt() {
		const updateCache = await this.readUpdateCache()
		if (updateCache.canary) {
			this.app.out("Canary releases are enabled.")
			if (await this.app.promptYesNo("Disable canary releases?")) {
				await this.writeUpdateCache({ ...updateCache, canary: false })
				this.app.out("Canary releases disabled. If you wish to rollback to the latest stable version, invoke `filen install latest`.")
			}
		} else {
			this.app.out("You are about to enable canary releases, which are early releases meant for a subset of users to test before they are declared as stable.\n" +
				"You might encounter bugs or crashes, so please do not use this in production. Report bugs on GitHub: https://github.com/FilenCloudDienste/filen-cli/issues\n" +
				"To install the latest stable version again, invoke the CLI with the command `filen install latest`. To disable canary releases altogether, call `filen canary` again.")
			if (await this.app.promptYesNo("Enable canary releases?")) {
				await this.writeUpdateCache({ ...updateCache, canary: true })
				this.app.out("Canary releases enabled.")

				const { releases, canaryRelease } = await this.fetchReleaseInfo()
				const downloadUrl = this.getDownloadUrl(canaryRelease)
				if (semver.gt(canaryRelease.tag_name, version) && downloadUrl !== undefined) {
					if (await this.app.promptYesNo(`Install the latest canary release ${canaryRelease.tag_name} now?`)) {
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
		if (release === undefined) this.app.errExit(`No such version: ${version}`)
		const downloadUrl = this.getDownloadUrl(release)
		if (downloadUrl === undefined) this.app.errExit(`Unsupported platform ${process.platform} for version ${release.tag_name}`)
		if (await this.app.promptYesNo(`Download and install ${release.tag_name}?`)) {
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
						throw Error("unable to read update cache file", { cause: e })
					}
				})()
				const updateCache = (() => {
					try {
						return JSON.parse(content)
					} catch (e) {
						throw Error("unable to parse update cache file", { cause: e })
					}
				})()
				if (typeof updateCache.lastCheckedUpdate !== "number") throw new Error("malformed update cache file")
				return {
					lastCheckedUpdate: updateCache.lastCheckedUpdate,
					canary: updateCache.canary ?? false
				}
			} catch (e) {
				this.app.outErr("read recent update checks: " + (e as Error).message, (e as Error).cause, "invoke the CLI again to retry updating")
				try {
					await fs.promises.rm(this.updateCacheFile)
				} catch (e) {
					this.app.errExit("delete update cache file", e)
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
				this.app.errExit("fetch update info", e)
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
				default: this.app.errExit(`Error trying to update on unsupported platform ${process.platform}`)
			}
		})()
		return release.assets.find(asset => asset.name.includes(platformStr) && asset.name.includes(process.arch))?.browser_download_url
	}

	// install
	
	private async showChangelogs(releases: ReleaseInfo[], targetRelease: string, skipConfirmation: boolean) {
		if (semver.lt(targetRelease, version)) return
		if (skipConfirmation || await this.app.promptYesNo("Show changelogs?", { defaultAnswer: true })) {
			const passingReleases = releases.sort((a, b) => semver.compare(a.tag_name, b.tag_name)).filter(release => semver.gt(release.tag_name, version) && semver.lte(release.tag_name, targetRelease) && !release.prerelease)
			const releaseBodies = passingReleases.map(release => `========== ${release.tag_name} ==========\n${release.body}\n${"=".repeat(22 + release.tag_name.length)}`)
			this.app.out("\n\n" + releaseBodies.join("\n\n\n") + "\n\n")
		}
	}

	private async installVersion(currentVersionName: string, publishedVersionName: string, downloadUrl: string) {
		const selfApplicationFile = process.pkg === undefined ? __filename : process.argv[0]!
		if (selfApplicationFile.endsWith(".js")) this.app.errExit("Updater only supported for CLI binaries")
		const downloadedFile = path.join(path.dirname(selfApplicationFile), `filen_update_${publishedVersionName}`)

		this.app.out("Downloading update...")
		try {
			await downloadFile(downloadUrl, downloadedFile)
		} catch (e) {
			this.app.errExit("download update", e)
		}

		this.app.out("Installing update...")
		if (process.platform === "win32") {
			const newFileName = path.basename(selfApplicationFile).replace(currentVersionName, publishedVersionName)
			if (path.basename(selfApplicationFile).includes(currentVersionName)) this.app.out(`Use the new version using the command: ${newFileName}`)
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
			process.exit() //TODO: remove process.exit(), and also writeLogsToDisk() before exiting
		}
		if (process.platform === "linux" || process.platform === "darwin") {
			const newFileName = selfApplicationFile.replace(currentVersionName, publishedVersionName)
			if (selfApplicationFile.includes(currentVersionName)) this.app.out(`Use the new version using the command: ${newFileName}`)
			const commands = [
				`rm "${selfApplicationFile}"`,
				`chmod +x "${downloadedFile}"`,
				`mv "${downloadedFile}" "${newFileName}"`,
				`echo "Successfully updated to ${publishedVersionName}"`,
				...(path.basename(selfApplicationFile).includes(currentVersionName) ? [`echo "Use the new version using the command: ${path.basename(selfApplicationFile).replace(currentVersionName, publishedVersionName)}"`] : []),
				"read -p \"Press enter to continue...\""
			]
			spawn("sh", ["-c", `${commands.join(" & ")}`], { detached: true })
			process.exit() //TODO: remove process.exit(), and also writeLogsToDisk() before exiting
		}
		this.app.errExit(`Could not install for platform ${process.platform}`)
	}
}