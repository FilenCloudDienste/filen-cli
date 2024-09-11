import FilenSDK from "@filen/sdk"
import VirtualDrive, { isFUSE3InstalledOnLinux, isWinFSPInstalled } from "@filen/network-drive"
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
		mountPoint = mountPoint ?? process.platform === "win32" ? "X:" : "/tmp/filen"
		out(`Mounting virtual drive for ${this.filen.config.email} at ${mountPoint}`)

		if (process.platform === "win32") {
			if (!await isWinFSPInstalled()) errExit("WinFSP is needed on Windows for virtual drive mounting. WinFSP could not be found.")
		}
		if (process.platform === "linux") {
			if (!await isFUSE3InstalledOnLinux()) errExit("FUSE 3 is needed in Linux for virtual drive mounting. FUSE 3 could not be found.")
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