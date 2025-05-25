import S3Server, { S3ServerCluster } from "@filen/s3"
import { feature, FlagType } from "../features"
import dedent from "dedent"
import { formatTable } from "../interface/util"

export const s3Command = feature({
	cmd: ["s3"],
	description: "Run an S3 server that mirrors your Filen drive.",
	longDescription: dedent`
		You must specify credentials (Access Key ID and Secret Access Key)
		for connecting to the server using the \`--s3-access-key-id\` and
		\`--s3-secret-access-key\` options (these credentials should be
		different from your Filen account credentials).

		Options:
		${formatTable([
			["--s3-https", "use HTTPS instead of HTTP (using a self-signed certificate)"],
			["--s3-hostname", "which hostname the server should be started on (default is 0.0.0.0)"],
			["--s3-port", "which port the server should be started on (default is 80 or 443)"],
			["--s3-threads", "enables clustering, number of threads to use for the server (default is no clustering; explicitly set to 0 to set by CPU core count)"],
		])}
	`,
	flags: {
		hostname: { name: "--s3-hostname", type: FlagType.string },
		port: { name: "--s3-port", type: FlagType.string },
		https: { name: "--s3-https", type: FlagType.boolean },
		accessKeyId: { name: "--s3-access-key-id", type: FlagType.string },
		secretAccessKey: { name: "--s3-secret-access-key", type: FlagType.string },
		threads: { name: "--s3-threads", type: FlagType.string },
	},
	invoke: ({ app, filen, flags }) => {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise<void>(async (resolve, reject) => {
			try {
				if (flags.accessKeyId === undefined || flags.secretAccessKey === undefined) {
					app.errExit("Need to specify --s3-access-key-id and --s3-secret-access-key")
				} // todo: is this necessary?

				const https = flags.https
				const hostname = flags.hostname ?? "0.0.0.0"
				const port = parseInt(flags.port!) ?? (flags.https ? 443 : 80) // todo: check if port is valid number
		
				const configuration = {
					hostname,
					port,
					https,
					user: {
						accessKeyId: flags.accessKeyId!,
						secretKeyId: flags.secretAccessKey!,
						sdk: filen
					}
				}
				const threads = parseInt(flags.threads ?? "0")
				const s3Server = flags.threads === undefined
					? new S3Server(configuration)
					: new S3ServerCluster({ ...configuration, threads: threads !== 0 ? threads : undefined })
				await s3Server.start()
				let location = `${https ? "https" : "http"}://${hostname}:${port}`
				if (hostname === "127.0.0.1" || hostname === "0.0.0.0") location += ` or ${https ? "https" : "http"}://local.s3.filen.io:${port}`
				app.out(`S3 server for ${filen.config.email} started on ${location}`)
				app.addInterruptListener(() => {
					app.out("Stopping S3 server")
					s3Server.stop().then(() => resolve())
					//TODO: how can I remove the "Terminate batch job (Y/N)?" message?
				})
			} catch (e) {
				reject(e)
			}
		})
	}
})