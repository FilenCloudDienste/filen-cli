import FilenSDK, { APIError, FilenSDKConfig } from "@filen/sdk"
import { err, errExit, out, outVerbose, prompt, promptConfirm } from "../interface/interface"
import fs from "node:fs"
import { exists, platformConfigPath } from "../util/util"
import path from "path"
import { wrapRedTerminalText } from "../interface/util"
import { ANONYMOUS_SDK_CONFIG } from "../constants"
import keytar from "keytar"
import crypto from "node:crypto"
import { isDevelopment } from "../index"

/**
 * Handles authentication.
 */
export class Authentication {
	private readonly filen: FilenSDK

	private readonly authConfigFileName = ".filen-cli-auth-config"
	private readonly keepMeLoggedInFile = path.join(platformConfigPath(), ".filen-cli-keep-me-logged-in")

	private readonly keychainServiceName = "filen-cli"
	private readonly keychainAccountName = "auth-config-crypto-key" + (isDevelopment ? "-dev" : "")

	public constructor(filen: FilenSDK) {
		this.filen = filen
	}

	/**
	 * Delete saved credentials (the `logout` command)
	 */
	public async deleteSavedCredentials() {
		try {
			if (await exists(this.keepMeLoggedInFile)) await fs.promises.unlink(this.keepMeLoggedInFile)
		} catch (e) {
			errExit("delete saved credentials file", e)
		}
		out("Credentials deleted")
	}

	/**
	 * Find the chosen authentication method and authenticate.
	 * Prompt for 2FA code if necessary.
	 * @param emailArg the `--email` CLI argument
	 * @param passwordArg the `--password` CLI argument
	 * @param twoFactorCodeArg the `--two-factor-code` CLI argument
	 * @param exportAuthConfig the `export-auth-config` CLI command
	 */
	public async authenticate(
		emailArg: string | undefined,
		passwordArg: string | undefined,
		twoFactorCodeArg: string | undefined,
		exportAuthConfig: boolean
	) {
		// delete legacy saved credentials
		for (const file of [path.join(platformConfigPath(), ".credentials"), path.join(platformConfigPath(), ".credentials.salt")]) {
			if (await exists(file)) await fs.promises.unlink(file)
		}

		let credentials: { email: string, password: string, twoFactorCode?: string } | undefined = undefined
		const needCredentials = () => credentials === undefined && (this.filen.config.email === "anonymous" || !this.filen.config.email)

		// try various methods to get credentials or login:

		// get credentials from arguments
		if (emailArg !== undefined) {
			if (passwordArg === undefined) errExit("Need to also specify argument --password")
			outVerbose(`Logging in as ${emailArg} (using arguments)`)
			credentials = { email: emailArg, password: passwordArg, twoFactorCode: twoFactorCodeArg }
		}

		// otherwise: get credentials from environment variables
		if (needCredentials() && process.env.FILEN_EMAIL !== undefined) {
			if (process.env.FILEN_PASSWORD === undefined) errExit("Need to also specify environment variable FILEN_PASSWORD")
			outVerbose(`Logging in as ${process.env.FILEN_EMAIL} (using environment variables)`)
			credentials = {
				email: process.env.FILEN_EMAIL,
				password: process.env.FILEN_PASSWORD,
				twoFactorCode: process.env.FILEN_2FA_CODE
			}
		}

		// otherwise: get credentials from .filen-cli-credentials
		if (needCredentials() && await exists(".filen-cli-credentials")) {
			const lines = (await fs.promises.readFile(".filen-cli-credentials")).toString().split("\n")
			if (lines.length < 2) errExit("Invalid .filen-cli-credentials!")
			const twoFactorCode = lines.length > 2 ? lines[2] : undefined
			outVerbose(`Logging in as ${lines[0]} (using .filen-cli-credentials)`)
			credentials = { email: lines[0]!, password: lines[1]!, twoFactorCode }
		}

		// otherwise: login from .filen-cli-auth-config
		if (needCredentials()) {
			const authConfigFilePath = await (async () => {
				if (await exists(this.authConfigFileName)) return this.authConfigFileName
				if (await exists(path.join(platformConfigPath(), this.authConfigFileName))) return path.join(platformConfigPath(), this.authConfigFileName)
				return undefined
			})()
			if (authConfigFilePath !== undefined) {
				try {
					const encodedConfig = (await fs.promises.readFile(authConfigFilePath)).toString()
					const sdkConfig = await this.decodeAuthConfig(encodedConfig)
					outVerbose(`Logging in as ${sdkConfig.email} (using ${authConfigFilePath})`)
					this.filen.init(sdkConfig)
					if (!(await this.filen.user().checkAPIKeyValidity())) throw new Error("invalid API key")
				} catch (e) {
					err(`login from ${authConfigFilePath}`, e, "try generating a new auth config")
					this.filen.logout()
				}
			}
		}

		// otherwise: login from .filen-cli-keep-me-logged-in
		if (needCredentials() && await exists(this.keepMeLoggedInFile)) {
			const cryptoKey = await (async () => {
				try {
					const key = await keytar.getPassword(this.keychainServiceName, this.keychainAccountName)
					if (key === null) errExit("There's a saved credentials file, but no crypto key in the keychain. Try `filen logout` and login again.")
					return key
				} catch (e) {
					errExit("get saved credentials crypto key from keychain")
				}
			})()
			try {
				const encryptedAuthConfig = (await fs.promises.readFile(this.keepMeLoggedInFile)).toString()
				const sdkConfig = await this.decryptAuthConfig(encryptedAuthConfig, cryptoKey)
				outVerbose(`Logging in as ${sdkConfig.email} (using saved credentials)`)
				this.filen.init(sdkConfig)
				if (!(await this.filen.user().checkAPIKeyValidity())) throw new Error("invalid API key")
			} catch (e) {
				err("login from saved credentials", e)
				this.filen.logout()
			}
		}

		// otherwise: get credentials from prompt
		const authenticateUsingPrompt = needCredentials()
		if (authenticateUsingPrompt) {
			out("Please enter your Filen credentials:")
			const email = await prompt("Email: ", { allowExit: true })
			const password = await prompt("Password: ", { allowExit: true, obfuscate: true })
			if (!email || !password) errExit("Please provide your credentials!")
			credentials = { email, password }
		}

		// try to log in, optionally prompt for 2FA
		if ((this.filen.config.email === "anonymous" || !this.filen.config.email) && credentials) {
			let authed = false
			let twoFactorCode: string | undefined = credentials.twoFactorCode

			try {
				this.filen.init(ANONYMOUS_SDK_CONFIG)

				await this.filen.login(credentials)

				authed = true
			} catch (e) {
				if (e instanceof APIError) {
					if (e.code === "enter_2fa" || e.code === "wrong_2fa") {
						twoFactorCode = await prompt("Please enter your 2FA code or recovery key: ", { allowExit: true, obfuscate: true })
					} else if (e.code === "email_or_password_wrong") {
						errExit("Invalid credentials!")
					} else {
						errExit("login", e)
					}
				} else {
					errExit("login", e)
				}
			}

			if (!authed && twoFactorCode) {
				try {
					this.filen.init(ANONYMOUS_SDK_CONFIG)

					await this.filen.login({
						...credentials,
						twoFactorCode
					})

					authed = true
				} catch (e) {
					if (e instanceof APIError) {
						if (e.code === "enter_2fa" || e.code === "wrong_2fa") {
							errExit("Invalid Two Factor Authentication code!")
						} else if (e.code === "email_or_password_wrong") {
							errExit("Invalid credentials!")
						} else {
							errExit("login", e)
						}
					} else {
						errExit("login", e)
					}
				}
			}
		}

		// export credentials to .filen-cli-auth-config
		if (exportAuthConfig) {
			if (await exists(this.authConfigFileName)) {
				if (!(await promptConfirm(`overwrite ${this.authConfigFileName}`))) process.exit()
			}
			const input = await prompt(
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
			if (input.toLowerCase() !== "i am aware of the risks") errExit("Cancelled.")
			const exportLocation = await prompt("Choose an export location: [1] $APP_DATA/filen-cli, [2] here:")
			const exportPath = (() => {
				if (exportLocation === "1") return path.join(platformConfigPath(), ".filen-cli-auth-config")
				if (exportLocation === "2") return path.join(process.cwd(), ".filen-cli-auth-config")
				errExit("Invalid input, please choose \"1\" or \"2\"")
			})()
			try {
				const encodedConfig = await this.encodeAuthConfig(this.filen.config)
				await fs.promises.writeFile(exportPath, encodedConfig)
				out(`Saved auth config to ${exportPath}`)
				process.exit()
			} catch (e) {
				errExit("save auth config", e)
			}
		}

		// save credentials from prompt
		if (authenticateUsingPrompt) {
			if ((await prompt("Keep me logged in? [y/N] ", { allowExit: true })).toLowerCase() === "y") {
				const cryptoKey = this.generateCryptoKey()
				try {
					await keytar.setPassword(this.keychainServiceName, this.keychainAccountName, cryptoKey)
				} catch (e) {
					errExit("save credentials crypto key in keychain", e, process.platform === "linux" ? "You seem to be running Linux, is libsecret installed? Please see `filen help libsecret` for more information" : undefined)
				}
				try {
					const encryptedAuthConfig = await this.encryptAuthConfig(this.filen.config, cryptoKey)
					await fs.promises.writeFile(this.keepMeLoggedInFile, encryptedAuthConfig)
					out("You can delete these credentials using `filen logout`")
				} catch (e) {
					errExit("save credentials", e, process.platform === "linux" ? "You seem to be running Linux, is libsecret installed? Please see `filen help libsecret` for more information" : undefined)
				}
			}
			out("")
		}
	}

	private async encodeAuthConfig(config: FilenSDKConfig) {
		return Buffer.from(JSON.stringify(config)).toString("base64")
	}

	private async decodeAuthConfig(encoded: string) {
		return JSON.parse(Buffer.from(encoded, "base64").toString()) as FilenSDKConfig
	}

	private generateCryptoKey() {
		return crypto.randomBytes(32).toString("hex")
	}

	private async encryptAuthConfig(config: FilenSDKConfig, cryptoKey: string) {
		const key = Buffer.from(cryptoKey, "hex")
		const iv = crypto.randomBytes(12)
		const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
		const encrypted = Buffer.concat([cipher.update(JSON.stringify(config)), cipher.final()])
		const authTag = cipher.getAuthTag()
		return Buffer.concat([iv, encrypted, authTag]).toString("base64")
	}

	private async decryptAuthConfig(encryptedAuthConfig: string, cryptoKey: string) {
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
}
