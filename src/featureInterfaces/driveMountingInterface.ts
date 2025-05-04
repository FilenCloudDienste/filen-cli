import FilenSDK from "@filen/sdk"
import VirtualDrive, { isFUSE3InstalledOnLinux, isWinFSPInstalled, isMacFUSEInstalled, isFUSETInstalledOnMacOS } from "@filen/network-drive"
import { App } from "../app"

/**
 * Provides the interface for drive mounting.
 */
export class DriveMountingInterface {
	constructor(private app: App, private filen: FilenSDK) {}

	public async invoke(mountPoint: string | undefined) {
		return new Promise<void>(async (resolve) => {
			mountPoint = mountPoint ?? (process.platform === "win32" ? "X:" : "/tmp/filen")
			this.app.out(`Mounting network drive for ${this.filen.config.email} at ${mountPoint}`)

			if (process.platform === "win32") {
				if (!await isWinFSPInstalled()) this.app.errExit("WinFSP is needed on Windows for network drive mounting, but it could not be found.")
			}
			if (process.platform === "linux") {
				if (!await isFUSE3InstalledOnLinux()) this.app.errExit("FUSE 3 is needed on Linux for network drive mounting, but it could not be found.")
			}
			if (process.platform === "darwin") {
				if (!await isMacFUSEInstalled() && !await isFUSETInstalledOnMacOS()) this.app.errExit("macFUSE or FUSE-T is needed on macOS for network drive mounting, but neither could be found.")
			}

			const virtualDrive = new VirtualDrive({
				sdk: this.filen,
				mountPoint: mountPoint
			})
			await virtualDrive.start()
			this.app.out("Mounted")
			this.app.addInterruptListener(() => {
				this.app.out("Unmounting")
				virtualDrive.stop()
				resolve()
			})
		})
	}
}