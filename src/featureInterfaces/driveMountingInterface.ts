import FilenSDK from "@filen/sdk"
import VirtualDrive from "@filen/virtual-drive"
import { InterruptHandler } from "../interface/interrupt"
import { out } from "../interface/interface"

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