import WebDAVServer, { WebDAVServerCluster } from "@filen/webdav"
import FilenSDK from "@filen/sdk"
import cluster from "node:cluster"
import dedent from "dedent"
import { BuiltArgument, FeatureGroup, ParsedArgs } from "../../framework/features"
import { f, X } from "../f"
import { App } from "../../framework/app"

const commonWebdavArgs = {
	hostname: f.defaultValue("0.0.0.0", f.option({ name: "--w-hostname", description: "which hostname the server should be started on" })),
	port: f.number(f.option({ name: "--w-port", description: "which port the server should be started on (default is 80 or 443)" })),
	https: f.flag({ name: "--w-https", description: "use HTTPS instead of HTTP (using a self-signed certificate)" }),
	threads: f.number(f.option({ name: "--w-threads", description: "enables clustering, number of threads to use for the server (default is no clustering; explicitly set to 0 to set by CPU core count). If you experience rate-limiting using this, an auth config might help (`filen help export-auth-config`)" })),
} as const satisfies Record<string, BuiltArgument<X, string | boolean | number | undefined>>

export const webdavCommandGroup: FeatureGroup<X> = {
	title: "WebDAV server",
	name: "webdav",
	description: "Run a WebDAV server that mirrors your Filen drive.",
	features: [
		f.feature({
			cmd: ["webdav"],
			description: "Run a WebDAV server that mirrors your Filen drive (single user).",
			longDescription: dedent`
				This might be useful for allowing local applications to access your
				Filen Drive via WebDAV. You must specify login credentials for connecting
				to the server using the \`--w-user\` and \`--w-password\` options (these
				credentials should be different from your Filen account credentials).
			`,
			args: {
				username: f.required(f.option({ name: "--w-user", description: "username for authentication" })),
				password: f.required(f.option({ name: "--w-password", description: "password for authentication" })),
				...commonWebdavArgs,
				authScheme: f.required(f.option({ name: "--w-auth-scheme", description: "the authentication scheme the server should use, \"basic\" or \"digest\" (default is basic)" })),
			},
			invoke: ({ app, filen, args }) => runWebDAV(app, filen, false, args)
		}),
		f.feature({
			cmd: ["webdav-proxy"],
			description: "Run a WebDAV server that mirrors Filen drives (proxy mode).",
			longDescription: dedent`
				The proxy-mode server allows any user to connect using their Filen account
				crednetials and access their own Filen drive. This might be useful when
				hosting a proxy server for multiple users.
				Digest auth is not available for proxy mode.

				In proxy mode, the password has to be formatted as
				\`password=yoursecretpassword&twoFactorAuthentication=<RECOVERY_CODE_OR_6_DIGIT_OTP_CODE>\`
				(you can also leave out the \`&twoFactorAuthentication=...\` part if 2FA is disabled for your account).
				`,
			args: commonWebdavArgs,
			skipAuthentication: true,
			invoke: ({ app, filen, args }) => runWebDAV(app, filen, true, args)
		})
	],
}

function runWebDAV(app: App<X>, filen: FilenSDK, proxyMode: boolean, args: ParsedArgs<X, typeof commonWebdavArgs> & { username?: string, password?: string, authScheme?: string }) {
	// eslint-disable-next-line no-async-promise-executor
	return new Promise<void>(async (resolve, reject) => {
		try {
			const https = args.https
			const hostname = args.hostname ?? "0.0.0.0"
			const port = args.port ?? (args.https ? 443 : 80)

			if (args.authScheme !== undefined && args.authScheme !== "basic" && args.authScheme !== "digest") {
				app.errExit("The only valid options for auth scheme are \"basic\" (default), \"digest\"")
			}
			if (proxyMode && args.authScheme === "digest") {
				app.errExit("Only basic auth is supported in proxy mode")
			}
			const authScheme = args.authScheme ?? "basic"

			const configuration = {
				user: proxyMode ? undefined : {
					username: args.username!,
					password: args.password!,
					sdk: filen
				},
				https,
				hostname,
				port,
				authMode: authScheme as "basic" | "digest"
			}
			if (args.threads !== undefined && cluster.isPrimary) {
				// work around bug with pkg that interprets execArgv as module name
				cluster.setupPrimary({ execArgv: [] })
			}
			const webdavServer = args.threads === undefined
				// @ts-expect-error next-line (other @filen dependencies are not yet updated to the latest @filen/sdk version)
				? new WebDAVServer(configuration)
				// @ts-expect-error next-line (other @filen dependencies are not yet updated to the latest @filen/sdk version)
				: new WebDAVServerCluster({ ...configuration, threads: args.threads !== 0 ? args.threads : undefined })
			await webdavServer.start()
			let location = `${https ? "https" : "http"}://${hostname}:${port}`
			if (hostname === "127.0.0.1" || hostname === "0.0.0.0") location += ` or ${https ? "https" : "http"}://local.webdav.filen.io:${port}`
			app.out(`WebDAV ${proxyMode ? "proxy server" : "server for " + filen.config.email} started on ${location}`)
			app.addInterruptListener(() => {
				app.out("Stopping WebDAV server")
				webdavServer.stop().then(() => resolve())
				//TODO: how can I remove the "Terminate batch job (Y/N)?" message?
			})
		} catch (e) {
			reject(e)
		}
	})
}