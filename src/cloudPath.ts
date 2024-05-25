import FilenSDK from "@filen/sdk"

/**
 * Represents a path (file or directory) in the cloud.
 * The path is represented by the corresponding array of path segments.
 */
export class CloudPath {
	readonly cloudPath: string[]

	public constructor(cloudPath: string[]) {
		this.cloudPath = cloudPath
	}

	/**
	 * Follows the directions given in the navigation string.
	 * @param path The navigation string. Segments are separated by "/". May contain "." and "..".
	 *             Navigations string starting with "/" are interpreted as new absolute paths.
	 * @returns The resulting CloudPath
	 */
	public navigate(path: string): CloudPath {
		if (path.startsWith("\"") && path.endsWith("\"")) path = path.substring(1, path.length - 1)
		if (path.startsWith("/")) return new CloudPath(path.substring(1).split("/"))
		else {
			let newPath = [...this.cloudPath]
			for (let segment of path.split("/")) {
				if (segment.startsWith("\"") && segment.endsWith("\"")) segment = segment.substring(1, segment.length - 1)
				if (segment.length === 0) continue
				if (segment === ".") continue
				if (segment === "..") newPath = newPath.slice(0, newPath.length - 1)
				else newPath = [...newPath, segment]
			}
			return new CloudPath(newPath)
		}
	}

	/**
	 * Navigates and appends a filename to the path if it would otherwise point to a directory.
	 * @see navigate
	 * @param path The navigation string
	 * @param fileName The filename to append if necessary
	 */
	public async navigateAndAppendFileNameIfNecessary(filen: FilenSDK, path: string, fileName: string): Promise<CloudPath> {
		let appendFileName: boolean
		const cloudPath = this.navigate(path)
		if (path.endsWith("/")) appendFileName = true
		else {
			try {
				appendFileName = (await filen.fs().stat({ path: cloudPath.toString() })).isDirectory()
			} catch (e) {
				appendFileName = false
			}
		}
		if (appendFileName) return cloudPath.navigate(fileName)
		else return cloudPath
	}

	public getLastSegment(): string {
		return this.cloudPath[this.cloudPath.length - 1]!
	}

	/**
	 * Formats this path like "/.../...".
	 */
	public toString() {
		return "/" + this.cloudPath.join("/")
	}
}