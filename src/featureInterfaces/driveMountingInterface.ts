import FilenSDK from "@filen/sdk"
import VirtualDrive, { isFUSE3InstalledOnLinux, isWinFSPInstalled, isMacFUSEInstalled, isFUSETInstalledOnMacOS } from "@filen/network-drive"
import { InterruptHandler } from "../interface/interrupt"
import { errExit, out } from "../interface/interface"

/**
 * Provides the interface for drive mounting.
 */
export class DriveMountingInterface {
	private readonly filen: FilenSDK

	constructor(filen: FilenSDK) {
		this.filen = filen
	}

	public async invoke(mountPoint: string | undefined) {
		mountPoint = mountPoint ?? (process.platform === "win32" ? "X:" : "/tmp/filen")
		out(`Mounting network drive for ${this.filen.config.email} at ${mountPoint}`)

		if (process.platform === "win32") {
			if (!await isWinFSPInstalled()) errExit("WinFSP is needed on Windows for network drive mounting, but it could not be found.")
		}
		if (process.platform === "linux") {
			if (!await isFUSE3InstalledOnLinux()) errExit("FUSE 3 is needed on Linux for network drive mounting, but it could not be found.")
		}
		if (process.platform === "darwin") {
			if (!await isMacFUSEInstalled() && !await isFUSETInstalledOnMacOS()) errExit("macFUSE or FUSE-T is needed on macOS for network drive mounting, but neither could be found.")
		}

		const virtualDrive = new VirtualDrive({
			sdk: this.filen,
			mountPoint: mountPoint
		})
		await virtualDrive.start()
		out("Mounted")
		InterruptHandler.instance.addListener(() => {
			out("Unmounting")
			virtualDrive.stop()
				.then(() => process.exit())
		})
	}
}