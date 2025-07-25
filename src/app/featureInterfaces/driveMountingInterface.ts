import VirtualDrive, { isFUSE3InstalledOnLinux, isWinFSPInstalled, isMacFUSEInstalled, isFUSETInstalledOnMacOS } from "@filen/network-drive"
import dedent from "dedent"
import { f } from "../f"

export const driveMountingCommand = f.feature({
	cmd: ["mount"],
	description: "Mount a network drive that mirrors your Filen drive.",
	longDescription: dedent`
		On Windows, WinFSP (https://winfsp.dev/rel) needs to be installed.
		On Linux, FUSE3 (https://github.com/libfuse/libfuse) needs to be installed.
		On macOS, FUSE-T (https://www.fuse-t.org) or macFUSE (https://osxfuse.github.io) needs to be installed.
	`,
	args: {
		mountPoint: f.optionalArg({ name: "mount point", description: "drive letter (Windows; default: `X:`) or path (UNIX; default: `/tmp/filen`) to mount at" }),
	},
	invoke: ({ app, filen, args }) => {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise<void>(async (resolve, reject) => {
			try {
				args.mountPoint = args.mountPoint ?? (process.platform === "win32" ? "X:" : "/tmp/filen")
				app.out(`Mounting network drive for ${filen.config.email} at ${args.mountPoint}`)

				if (process.platform === "win32") {
					if (!await isWinFSPInstalled()) app.errExit("WinFSP is needed on Windows for network drive mounting, but it could not be found.")
				}
				if (process.platform === "linux") {
					if (!await isFUSE3InstalledOnLinux()) app.errExit("FUSE 3 is needed on Linux for network drive mounting, but it could not be found.")
				}
				if (process.platform === "darwin") {
					if (!await isMacFUSEInstalled() && !await isFUSETInstalledOnMacOS()) app.errExit("macFUSE or FUSE-T is needed on macOS for network drive mounting, but neither could be found.")
				}

				const virtualDrive = new VirtualDrive({
					// @ts-expect-error next-line (other @filen dependencies are not yet updated to the latest @filen/sdk version)
					sdk: filen,
					mountPoint: args.mountPoint
				})
				await virtualDrive.start()
				app.out("Mounted")
				app.addInterruptListener(() => {
					app.out("Unmounting")
					virtualDrive.stop()
					resolve()
				})
			} catch (e) {
				reject(e)
			}
		})
	}
})