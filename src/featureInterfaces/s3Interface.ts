import FilenSDK from "@filen/sdk"
import { errExit, out } from "../interface/interface"
import { InterruptHandler } from "../interface/interrupt"
import S3Server, { S3ServerCluster } from "@filen/s3"

export const s3Options = {
	"--s3-hostname": String,
	"--s3-port": Number,
	"--s3-https": Boolean,
	"--s3-access-key-id": String,
	"--s3-secret-access-key": String
}

/**
 * Provides the interface for configuring and running an S3 server.
 */
export class S3Interface {
	private readonly filen

	constructor(filen: FilenSDK) {
		this.filen = filen
	}

	public async invoke(args: {
		hostname: string | undefined,
		port: number | undefined,
		https: boolean,
		accessKeyId: string | undefined,
		secretAccessKey: string | undefined,
		threads: number | undefined,
	}) {
		if (args.accessKeyId === undefined || args.secretAccessKey === undefined) {
			errExit("Need to specify --s3-access-key-id and --s3-secret-access-key")
		}

		const https = args.https
		const hostname = args.hostname ?? "0.0.0.0"
		const port = args.port ?? (args.https ? 443 : 80)

		const configuration = {
			hostname,
			port,
			https,
			user: {
				accessKeyId: args.accessKeyId,
				secretKeyId: args.secretAccessKey,
				sdkConfig: this.filen.config
			}
		}
		const s3Server = args.threads === undefined
			? new S3Server(configuration)
			: new S3ServerCluster({ ...configuration, threads: args.threads !== 0 ? args.threads : undefined })
		await s3Server.start()
		let location = `${https ? "https" : "http"}://${hostname}:${port}`
		if (hostname === "127.0.0.1" || hostname === "0.0.0.0") location += ` or ${https ? "https" : "http"}://local.s3.filen.io:${port}`
		out(`S3 server for ${this.filen.config.email} started on ${location}`)
		InterruptHandler.instance.addListener(() => {
			out("Stopping S3 server")
			s3Server.stop()
				.then(() => process.exit())
		})
	}
}