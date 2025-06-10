import S3Server, { S3ServerCluster } from "@filen/s3"
import dedent from "dedent"
import { f } from "../app"

export const s3Command = f.feature({
	cmd: ["s3"],
	description: "Run an S3 server that mirrors your Filen drive.",
	args: {
		accessKeyId: f.required(f.option({ name: "--s3-access-key-id", description: "Access Key ID for S3" })),
		secretAccessKey: f.required(f.option({ name: "--s3-secret-access-key", description: "Secret Access Key for S3" })),
		hostname: f.defaultValue("0.0.0.0", f.option({ name: "--s3-hostname", description: "which hostname the server should be started on" })),
		port: f.number(f.option({ name: "--s3-port", description: "which port the server should be started on (default: 80 or 443)" })),
		https: f.flag({ name: "--s3-https", description: "use HTTPS instead of HTTP (using a self-signed certificate)" }),
		threads: f.number(f.option({ name: "--s3-threads", description: "enables clustering, number of threads to use for the server (default is no clustering; explicitly set to 0 to set by CPU core count). If you experience rate-limiting using this, an auth config might help (`filen help export-auth-config`)" })),
	},
	longDescription: dedent`
		Important: When connecting to the S3 server, you need to enable \`s3ForcePathStyle\` and set the region to \`filen\`.
		For information on S3 compatibility, see https://github.com/FilenCloudDienste/filen-s3.
	`,
	invoke: ({ app, filen, args }) => {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise<void>(async (resolve, reject) => {
			try {
				const https = args.https
				const hostname = args.hostname
				const port = args.port ?? (args.https ? 443 : 80)

				const configuration = {
					hostname,
					port,
					https,
					user: {
						accessKeyId: args.accessKeyId,
						secretKeyId: args.secretAccessKey,
						sdk: filen
					}
				}
				const threads = args.threads ?? 0
				const s3Server = args.threads === undefined
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