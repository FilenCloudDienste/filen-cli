import WebDAVServer, { WebDAVServerCluster } from "@filen/webdav"
import FilenSDK from "@filen/sdk"
import cluster from "node:cluster"
import { App } from "../app"
import { feature, FeatureGroup, FlagSpec, FlagType, ParsedFlags } from "../features"
import dedent from "dedent"

const commonWebdavFlags = {
	hostname: { name: "--w-hostname", type: FlagType.string, description: "which hostname the server should be started on (default is 0.0.0.0)" },
	port: { name: "--w-port", type: FlagType.string, description: "which port the server should be started on (default is 80 or 443)" },
	https: { name: "--w-https", type: FlagType.boolean, description: "use HTTPS instead of HTTP (using a self-signed certificate)" },
	threads: { name: "--w-threads", type: FlagType.string, description: "enables clustering, number of threads to use for the server (default is no clustering; explicitly set to 0 to set by CPU core count). If you experience rate-limiting using this, an auth config might help (`filen help export-auth-config`)`" },
} as const satisfies Record<string, FlagSpec>

export const webdavCommandGroup: FeatureGroup = {
	title: "WebDAV server",
	name: "webdav",
	description: "Run a WebDAV server that mirrors your Filen drive.",
	features: [
		feature({
			cmd: ["webdav"],
			description: "Run a WebDAV server that mirrors your Filen drive (single user).",
			longDescription: dedent`
				This might be useful for allowing local applications to access your
				Filen Drive via WebDAV. You must specify login credentials for connecting
				to the server using the \`--w-user\` and \`--w-password\` options (these
				credentials should be different from your Filen account credentials).
			`,
			flags: {
				username: { name: "--w-user", type: FlagType.string, required: true, description: "username for authentication" },
				password: { name: "--w-password", type: FlagType.string, required: true, description: "password for authentication" },
				...commonWebdavFlags,
				authScheme: { name: "--w-auth-scheme", type: FlagType.string, description: "the authentication scheme the server should use, \"basic\" or \"digest\" (default is basic)" },
			},
			invoke: ({ app, filen, flags }) => runWebDAV(app, filen, false, flags)
		}),
		feature({
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
			flags: commonWebdavFlags,
			skipAuthentication: true,
			invoke: ({ app, filen, flags }) => runWebDAV(app, filen, true, flags)
		})
	],
}

function runWebDAV(app: App, filen: FilenSDK, proxyMode: boolean, flags: ParsedFlags<typeof commonWebdavFlags> & { username?: string, password?: string, authScheme?: string }) {
	const args = {
		username: flags.username,
		password: flags.password,
		https: flags.https,
		hostname: flags.hostname,
		port: flags.port ? parseInt(flags.port) : undefined,
		authScheme: flags.authScheme,
		threads: flags.threads ? parseInt(flags.threads) : undefined,
	}

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
				? new WebDAVServer(configuration)
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