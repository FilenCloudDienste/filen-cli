import WebDAVServer from "@filen/webdav"
import FilenSDK from "@filen/sdk"
import { err, errExit, out } from "../interface/interface"
import { InterruptHandler } from "../interface/interrupt"

export const webdavOptions = {
	"--webdav": Boolean,
	"--w-hostname": String,
	"--w-port": Number,
	"--w-user": String,
	"--w-password": String,
}

/**
 * Provides the interface for configuring and running a WebDAV server.
 */
export class WebDAVInterface {
	private readonly filen

	constructor(filen: FilenSDK) {
		this.filen = filen
	}

	public async invoke(args: {
		hostname: string | undefined,
		port: number | undefined,
		username: string | undefined,
		password: string | undefined
	}) {
		if (args.username === undefined || args.password === undefined) {
			errExit("Need to specify --w-user and --w-password")
		}

		const hostname = args.hostname ?? "0.0.0.0"
		const port = args.port ?? 1901

		try {
			const server = new WebDAVServer({
				users: [
					{
						name: args.username,
						password: args.password,
						isAdmin: true
					}
				],
				hostname,
				port,
				sdkConfig: this.filen.config
			})

			await server.initialize()
			out(`WebDAV server started on ${hostname}:${port}`)
			InterruptHandler.instance.addListener(() => {
				out("Stopping WebDAV server")
				process.exit()
			})
		} catch (e) {
			err(`An error occurred: ${e}`)
		}
	}
}