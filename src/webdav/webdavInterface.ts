import WebDAVServer from "@filen/webdav"
import FilenSDK from "@filen/sdk"
import { err, errExit, out } from "../interface/interface"
import { InterruptHandler } from "../interface/interrupt"

export const webdavOptions = {
	"--webdav": Boolean,
	"--w-hostname": String,
	"--w-port": Number,
	"--w-https": Boolean,
	"--w-auth-scheme": String,
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
		username: string | undefined,
		password: string | undefined,
		https: boolean,
		hostname: string | undefined,
		port: number | undefined,
		authScheme: string | undefined,
	}) {
		if (args.username === undefined || args.password === undefined) {
			errExit("Need to specify --w-user and --w-password")
		}

		const https = args.https
		const hostname = args.hostname ?? "0.0.0.0"
		const port = args.port ?? (args.https ? 443 : 80)

		if (args.authScheme !== undefined && args.authScheme !== "basic" && args.authScheme !== "digest") {
			errExit("The only valid options for auth scheme are \"basic\" (default), \"digest\"")
		}
		const authScheme = args.authScheme ?? "basic"

		new WebDAVServer({
			user: {
				username: args.username,
				password: args.password,
				sdkConfig: this.filen.config
			},
			https,
			hostname,
			port,
			authMode: authScheme
		})
			.start()
			.then(() => {
				let location = `${https ? "https" : "http"}://${hostname}:${port}`
				if (hostname === "127.0.0.1" || hostname === "0.0.0.0") location += ` or ${https ? "https" : "http"}://local.webdav.filen.io:${port}`
				out(`WebDAV server started on ${location}`)
			})
			.catch(e => {
				err(`An error occurred: ${e}`)
			})
		InterruptHandler.instance.addListener(() => {
			out("Stopping WebDAV server")
			process.exit()
		})
	}
}