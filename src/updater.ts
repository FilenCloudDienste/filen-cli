import { version } from "./buildInfo"
import { out, prompt } from "./interface"

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

		if (currentVersion !== publishedVersion) {
			if ((await prompt(`Update from ${currentVersion} to ${publishedVersion}? [y/N] `)).toLowerCase() === "y") {
				await this.update(releaseInfo)
			}
		} else {
			if (verbose) out(`${currentVersion} is up to date.`)
		}
	}

	private async update(releaseInfo: ReleaseInfo) {
	}
}