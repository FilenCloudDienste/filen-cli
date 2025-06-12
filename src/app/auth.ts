import { APIError, FilenSDKConfig } from "@filen/sdk"
import fs from "node:fs"
import { exists } from "./util/util"
import path from "path"
import { wrapRedTerminalText } from "../framework/util"
import crypto from "node:crypto"
import { isRunningAsContainer } from "../buildInfo"
import dedent from "dedent"
import { f, X } from "./app"
import { FeatureContext, FeatureGroup } from "../framework/features"
import { App } from "../framework/app"

const authConfigFileName = ".filen-cli-auth-config"
const keepMeLoggedInFile = (app: App<X>) => path.join(app.dataDir, ".filen-cli-keep-me-logged-in")

const keychainServiceName = "filen-cli"
const keychainAccountName = (app: App<X>) => "auth-config-crypto-key" + (app.isDevelopment ? "-dev" : "")

export const authenticationCommandGroup: FeatureGroup<X> = {
	title: "Authentication", 
	name: "auth",
	description: dedent`
		Ways to authenticate:
		1) Invoke the CLI and specify your Filen email and password when prompted. Optionally, save your credentials.
		2) Pass the \`--email <email>\` and \`--password <password>\` (optionally \`--two-factor-code <2fa>\`) arguments.
		3) Put your credentials in the FILE_EMAIL and FILEN_PASSWORD (optionally FILEN_2FA_CODE) environment variables.
		4) Store your Filen email and password in a file named .filen-cli-credentials with email and password (optionally 2FA code) in separate plaintext lines.
		5) Export an "auth config" using \`filen export-auth-config\` and place it where you invoke the CLI. 
	`,
	features: [
		f.feature({
			cmd: ["logout"],
			description: "Delete saved credentials.",
			invoke: async ({ app }) => {
				try {
					if (await exists(keepMeLoggedInFile(app))) {
						await fs.promises.unlink(keepMeLoggedInFile(app))
						app.out("Credentials deleted")
					} else {
						app.out("No saved credentials")
					}
					if (await exists(authConfigFileName) || await exists(path.join(app.dataDir, authConfigFileName))) {
						app.out("There is a .filen-cli-auth-config file")
					}
				} catch (e) {
					app.errExit("delete saved credentials", e)
				}
			},
			skipAuthentication: true,
		}),
		f.feature({
			cmd: ["export-auth-config"],
			description: "Export your Filen credentials to a file.",
			longDescription: dedent`
				They are in unencrypted form! The file can be used
				to authenticate without an internal login request, making it suitable for if
				you're experience rate-limiting, e.g. in clustered WebDAV or S3 servers.
			`,
			invoke: async (ctx) => {
				await exportAuthConfig(ctx, false)
			}
		}),
		f.feature({
			cmd: ["export-api-key"],
			description: "Export your Filen API key (for use with Filen Rclone).",
			invoke: async ({ app, filen }) => {
				const input = await app.prompt("You are about to print your API Key, which gives full access to your account,\nto the screen. Proceed? (y/N) ")
				if (input.toLowerCase() !== "y") app.errExit("Cancelled.")
				app.out(`API Key for ${filen.config.email}: ${filen.config.apiKey}`)
			},
		}),
		f.helpText({
			name: "libsecret",
			text: dedent`
				On Linux, the Filen CLI uses libsecret to store the credentials crypto key in the system Secret Service.
				
				If you experience issues with saving credentials, you can try installing libsecret via:
					Debain/Ubuntu:  sudo apt-get install libsecret-1-dev
					Red Hat based:  sudo yum install libsecret-devel
					Arch:           sudo pacman -S libsecret

				A collection of issues and possible solutions can be found at: https://github.com/FilenCloudDienste/filen-cli/issues/288
				
				Alternatively, you can export an auth config containing your credentials using \`filen export-auth-config\`.
				Exporting this file to the data directory will make it visible to the CLI.
			`,
			visibility: "hide"
		}),
	],
}

export async function authenticate(ctx: FeatureContext<X>, args: { email?: string, password?: string, twoFactorCode?: string }) {
	const { app } = ctx; const { filen } = ctx.x
	try {
		// delete legacy saved credentials
		for (const file of [path.join(app.dataDir, ".credentials"), path.join(app.dataDir, ".credentials.salt")]) {
			if (await exists(file)) await fs.promises.unlink(file)
		}

		let credentials: { email: string, password: string, twoFactorCode?: string } | undefined = undefined
		const needCredentials = () => credentials === undefined && (filen.config.email === "anonymous" || !filen.config.email)

		// try various methods to get credentials or login:

		// get credentials from arguments
		if (args.email !== undefined) {
			if (args.password === undefined) return app.errExit("Need to also specify argument --password")
			app.outVerbose(`Logging in as ${args.email} (using arguments)`)
			credentials = { email: args.email, password: args.password, twoFactorCode: args.twoFactorCode }
		}

		// otherwise: get credentials from environment variables
		if (needCredentials() && process.env.FILEN_EMAIL !== undefined) {
			if (process.env.FILEN_PASSWORD === undefined) return app.errExit("Need to also specify environment variable FILEN_PASSWORD")
				app.outVerbose(`Logging in as ${process.env.FILEN_EMAIL} (using environment variables)`)
			credentials = {
				email: process.env.FILEN_EMAIL,
				password: process.env.FILEN_PASSWORD,
				twoFactorCode: process.env.FILEN_2FA_CODE
			}
		}

		// otherwise: get credentials from .filen-cli-credentials
		if (needCredentials() && await exists(".filen-cli-credentials")) {
			const lines = (await fs.promises.readFile(".filen-cli-credentials")).toString().split("\n")
			if (lines.length < 2) app.errExit("Invalid .filen-cli-credentials!")
			const twoFactorCode = lines.length > 2 ? lines[2] : undefined
			app.outVerbose(`Logging in as ${lines[0]} (using .filen-cli-credentials)`)
			credentials = { email: lines[0]!, password: lines[1]!, twoFactorCode }
		}

		// otherwise: login from .filen-cli-auth-config
		if (needCredentials()) {
			const authConfigFilePath = await (async () => {
				if (await exists(authConfigFileName)) return authConfigFileName
				if (await exists(path.join(app.dataDir, authConfigFileName))) return path.join(app.dataDir, authConfigFileName)
				return undefined
			})()
			if (authConfigFilePath !== undefined) {
				try {
					const encodedConfig = (await fs.promises.readFile(authConfigFilePath)).toString()
					const sdkConfig = await decodeAuthConfig(encodedConfig)
					app.outVerbose(`Logging in as ${sdkConfig.email} (using ${authConfigFilePath})`)
					filen.init(sdkConfig)
					if (!(await filen.user().checkAPIKeyValidity())) throw new Error("invalid API key")
				} catch (e) {
					app.outErr(`login from ${authConfigFilePath}`, e, "try generating a new auth config")
					filen.logout()
				}
			}
		}

		// otherwise: login from .filen-cli-keep-me-logged-in
		if (needCredentials() && await exists(keepMeLoggedInFile(app))) {
			const cryptoKey = await (async () => {
				try {
					const key = await getKeychainCryptoKey(ctx)
					if (key === null) return app.errExit("There's a saved credentials file, but no crypto key in the keychain. Try `filen logout` and login again.")
					return key
				} catch (e) {
					return app.errExit("get saved credentials crypto key from keychain", e)
				}
			})()
			try {
				const encryptedAuthConfig = (await fs.promises.readFile(keepMeLoggedInFile(app))).toString()
				const sdkConfig = await decryptAuthConfig(encryptedAuthConfig, cryptoKey)
				app.outVerbose(`Logging in as ${sdkConfig.email} (using saved credentials)`)
				filen.init(sdkConfig)
				if (!(await filen.user().checkAPIKeyValidity())) throw new Error("invalid API key")
			} catch (e) {
				app.outErr("login from saved credentials", e)
				filen.logout()
			}
		}

		// otherwise: get credentials from prompt
		const authenticateUsingPrompt = needCredentials()
		if (authenticateUsingPrompt) {
			app.out("Please enter your Filen credentials:")
			const email = await app.prompt("Email: ", { allowExit: true })
			const password = await app.prompt("Password: ", { allowExit: true, obfuscate: true })
			if (!email || !password) app.errExit("Please provide your credentials!")
			credentials = { email, password }
		}

		// try to log in, optionally prompt for 2FA
		if ((filen.config.email === "anonymous" || !filen.config.email) && credentials) {
			let authed = false
			let twoFactorCode: string | undefined = credentials.twoFactorCode

			try {
				await filen.login(credentials)

				authed = true
			} catch (e) {
				if (e instanceof APIError) {
					if (e.code === "enter_2fa" || e.code === "wrong_2fa") {
						twoFactorCode = await app.prompt("Please enter your 2FA code or recovery key: ", { allowExit: true, obfuscate: true })
					} else if (e.code === "email_or_password_wrong") {
						app.errExit("Invalid credentials!")
					} else {
						app.errExit("login", e)
					}
				} else {
					app.errExit("login", e)
				}
			}

			if (!authed && twoFactorCode) {
				try {
					await filen.login({
						...credentials,
						twoFactorCode
					})

					authed = true
				} catch (e) {
					if (e instanceof APIError) {
						if (e.code === "enter_2fa" || e.code === "wrong_2fa") {
							app.errExit("Invalid Two Factor Authentication code!")
						} else if (e.code === "email_or_password_wrong") {
							app.errExit("Invalid credentials!")
						} else {
							app.errExit("login", e)
						}
					} else {
						app.errExit("login", e)
					}
				}
			}
		}

		// save credentials from prompt
		if (authenticateUsingPrompt) {
			if (isRunningAsContainer) {
				if (await app.promptYesNo("Keep me logged in using unencrypted local credential storage?", { defaultAnswer: false })) {
					await exportAuthConfig(ctx, true)
				}
			} else {
				if (await app.promptYesNo("Keep me logged in?", { defaultAnswer: false, allowExit: true })) {
					try {
						const cryptoKey = generateCryptoKey()
						await setKeychainCryptoKey(ctx, cryptoKey)
						try {
							const encryptedAuthConfig = await encryptAuthConfig(filen.config, cryptoKey)
							await fs.promises.writeFile(keepMeLoggedInFile(app), encryptedAuthConfig)
							app.out("You can delete these credentials using `filen logout`")
						} catch (e) {
							app.errExit("save credentials", e)
						}
					} catch (e) {
						app.outErr("save credentials crypto key in keychain", e, process.platform === "linux" ? "You seem to be running Linux, is libsecret installed? Please see `filen help libsecret` for more information" : undefined)
						if (await app.promptYesNo("Use less secure unencrypted local credential storage instead?", { defaultAnswer: false })) {
							await exportAuthConfig(ctx, true)
						}
					}
				}
			}
			app.out("")
		}

		return { exit: false }
	} catch (e) {
		app.errExit("authenticate", e)
	}
}

/**
 * The `filen export-auth-config` command (export credentials to .filen-cli-auth-config).
 */
async function exportAuthConfig({ app, x }: FeatureContext<X>, onlyExportToDataDir = false) {
	const { filen } = x

	if (await exists(authConfigFileName)) {
		if (!(await app.promptConfirm(`overwrite ${authConfigFileName}`))) return
	}
	const input = await app.prompt(
		wrapRedTerminalText(
			"You are about to export a Filen CLI auth config," +
				"\nwhich is a file containing your unencrypted credentials." +
				"\nA person in possession of this file's content has full access to your Filen Drive," +
				"\nincluding reading, writing and deleting all your files, as well as all account operations." +
				// eslint-disable-next-line quotes
				'\nType "I am aware of the risks" to proceed: '
		),
		{ allowExit: true }
	)
	if (input.toLowerCase() !== "i am aware of the risks") app.errExit("Cancelled.")
	const exportLocation = onlyExportToDataDir ? "1" : await app.prompt("Choose an export location: [1] data directory, [2] here:")
	const exportPath = (() => {
		if (exportLocation === "1") return path.join(app.dataDir, ".filen-cli-auth-config")
		if (exportLocation === "2") return path.join(process.cwd(), ".filen-cli-auth-config")
		return app.errExit("Invalid input, please choose \"1\" or \"2\"")
	})()
	try {
		const encodedConfig = await encodeAuthConfig(filen.config)
		await fs.promises.writeFile(exportPath, encodedConfig)
		app.out(`Saved auth config to ${exportPath}`)
	} catch (e) {
		app.errExit("save auth config", e)
	}
}

async function encodeAuthConfig(config: FilenSDKConfig) {
	return Buffer.from(JSON.stringify(config)).toString("base64")
}

async function decodeAuthConfig(encoded: string) {
	return JSON.parse(Buffer.from(encoded, "base64").toString()) as FilenSDKConfig
}

function generateCryptoKey() {
	return crypto.randomBytes(32).toString("hex")
}

async function encryptAuthConfig(config: FilenSDKConfig, cryptoKey: string) {
	const key = Buffer.from(cryptoKey, "hex")
	const iv = crypto.randomBytes(12)
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
	const encrypted = Buffer.concat([cipher.update(JSON.stringify(config)), cipher.final()])
	const authTag = cipher.getAuthTag()
	return Buffer.concat([iv, encrypted, authTag]).toString("base64")
}

async function decryptAuthConfig(encryptedAuthConfig: string, cryptoKey: string) {
	const key = Buffer.from(cryptoKey, "hex")
	const data = Buffer.from(encryptedAuthConfig, "base64")
	const iv = data.subarray(0, 12)
	const encData = data.subarray(12)
	const authTag = encData.subarray(-16)
	const ciphertext = encData.subarray(0, encData.byteLength - 16)
	const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
	decipher.setAuthTag(authTag)
	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8")
	return JSON.parse(decrypted) as FilenSDKConfig
}

// `keytar` is imported dynamically so that errors not finding e.g. `libsecret-1.so.0`
// can be caught when actually attempting to access the keychain, not when importing the module
async function getKeychainCryptoKey({ app }: FeatureContext<X>): Promise<string | null> {
	const keytar = await import("keytar")
	return await keytar.getPassword(keychainServiceName, keychainAccountName(app))
}
async function setKeychainCryptoKey({ app }: FeatureContext<X>, cryptoKey: string): Promise<void> {
	const keytar = await import("keytar")
	await keytar.setPassword(keychainServiceName, keychainAccountName(app), cryptoKey)
}
