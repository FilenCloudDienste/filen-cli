import FilenSDK, { APIError } from "@filen/sdk"
import { err, errExit, out, outVerbose, prompt, promptConfirm } from "../interface/interface"
import fsModule from "node:fs"
import { exists } from "../util/util"
import path from "path"
import { CredentialsCrypto } from "./credentialsCrypto"
import { wrapRedTerminalText } from "../interface/util"
import { ANONYMOUS_SDK_CONFIG } from "../constants"
import { dataDir } from ".."

export type Credentials = {
	email: string
	password: string
	twoFactorCode?: string
}

/**
 * Handles authentication.
 */
export class Authentication {
	private readonly filen: FilenSDK

	private readonly crypto = new CredentialsCrypto()
	private readonly credentialsDirectory = dataDir
	private readonly credentialsFile = path.join(this.credentialsDirectory, ".credentials")
	private readonly sdkConfigFile = ".filen-cli-auth-config"

	public constructor(filen: FilenSDK) {
		this.filen = filen
	}

	/**
	 * Delete credentials stored in a file
	 */
	public async deleteStoredCredentials() {
		if (await exists(this.credentialsFile)) {
			await fsModule.promises.unlink(this.credentialsFile)
		}
		out("Credentials deleted")
	}

	/**
	 * Find the chosen authentication method and authenticate.
	 * Prompt for 2FA code if necessary.
	 * @param emailArg the `--email` CLI argument
	 * @param passwordArg the `--password` CLI argument
	 * @param twoFactorCodeArg the `--two-factor-code` CLI argument
	 * @param saveSDKConfigFile the `filen export-auth-config` command
	 * @param printApiKey the `filen export-api-key` command
	 */
	public async authenticate(
		emailArg: string | undefined,
		passwordArg: string | undefined,
		twoFactorCodeArg: string | undefined,
		saveSDKConfigFile: boolean,
		printApiKey: boolean,
	) {
		let credentials: Credentials | undefined = undefined
		const needCredentials = () => credentials === undefined && (this.filen.config.email === "anonymous" || !this.filen.config.email)

		// try to get credentials from args, environment and file
		for (const authenticate of [
			async () => await this.authenticateUsingArguments(emailArg, passwordArg, twoFactorCodeArg),
			async () => await this.authenticateUsingEnvironment(),
			async () => await this.authenticateUsingCredentialsFile()
		]) {
			credentials = await authenticate()
			if (credentials !== undefined) break
		}

		// otherwise: login from .filen-cli-auth-config
		if (needCredentials() && (await exists(this.sdkConfigFile))) {
			try {
				const sdkConfig = JSON.parse((await fsModule.promises.readFile(this.sdkConfigFile)).toString())
				outVerbose(`Logging in as ${sdkConfig.email} (using ${this.sdkConfigFile})`)
				this.filen.init(sdkConfig)
				if (!(await this.filen.user().checkAPIKeyValidity())) throw new Error("invalid API key")
			} catch (e) {
				err(`login from ${this.sdkConfigFile}`, e, "try regenerating the file")
				this.filen.logout()
			}
		}

		// otherwise: login from central file
		if (needCredentials() && (await exists(this.credentialsFile))) {
			const encryptedConfig = await fsModule.promises.readFile(this.credentialsFile, { encoding: "utf-8" })
			try {
				const config = await this.crypto.decrypt(encryptedConfig)
				outVerbose(`Logging in as ${config.email} (using saved credentials)`)
				this.filen.init(config)
				if (!(await this.filen.user().checkAPIKeyValidity())) throw new Error("invalid API key")
			} catch (e) {
				err("login from saved credentials", e, "try `filen delete-credentials`")
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

		// `filen export-auth-config`: save credentials as .filen-cli-auth-config
		if (saveSDKConfigFile) {
			if (await exists(this.sdkConfigFile)) {
				if (!(await promptConfirm(`overwrite ${this.sdkConfigFile}`))) process.exit()
			}
			const input = await prompt(
				wrapRedTerminalText(
					"You are about to export a Filen CLI auth config," +
						"\nwhich is a plaintext file containing your unencrypted credentials." +
						"\nA person in possession of this file's content has full access to your Filen Drive," +
						"\nincluding reading, writing and deleting all your files, as well as all account operations." +
						// eslint-disable-next-line quotes
						'\nType "I am aware of the risks" to proceed: '
				),
				{ allowExit: true }
			)
			if (input.toLowerCase() !== "i am aware of the risks") errExit("Cancelled.")
			try {
				await fsModule.promises.writeFile(this.sdkConfigFile, JSON.stringify(this.filen.config, null, 2))
				out(`Saved auth config to ${this.sdkConfigFile}`)
				process.exit()
			} catch (e) {
				errExit("save auth config", e)
			}
		}

		// `filen export-api-key`: print API key to the terminal (for Rclone integration)
		if (printApiKey) {
			const input = await prompt("You are about to print your API Key, which gives full access to your account,\nto the screen. Proceed? (y/N) ")
			if (input.toLowerCase() !== "y") errExit("Cancelled.")
			out(`API Key for ${this.filen.config.email}: ${this.filen.config.apiKey}`)
			process.exit()
		}

		// save credentials from prompt
		if (authenticateUsingPrompt) {
			const saveCredentials = (await prompt("Save credentials locally for future invocations? [y/N] ", { allowExit: true })).toLowerCase() === "y"
			if (saveCredentials) {
				try {
					const encryptedCredentials = await this.crypto.encrypt(this.filen.config)
					if (!(await exists(this.credentialsDirectory))) await fsModule.promises.mkdir(this.credentialsDirectory)
					await fsModule.promises.writeFile(this.credentialsFile, encryptedCredentials)
					out("You can delete these credentials using `filen delete-credentials`")
				} catch (e) {
					errExit("save credentials", e)
				}
			}
			out("")
		}
	}

	/**
	 * Authenticate using the `--email`, `--password` (and optionally `--two-factor-code`) CLI arguments, if applicable.
	 */
	private async authenticateUsingArguments(
		email: string | undefined,
		password: string | undefined,
		twoFactorCodeArg: string | undefined
	): Promise<Credentials | undefined> {
		if (email === undefined) return
		if (password === undefined) return errExit("Need to also specify argument --password")
		outVerbose(`Logging in as ${email} (using arguments)`)
		return { email, password, twoFactorCode: twoFactorCodeArg }
	}

	/**
	 * Authenticate using the FILEN_EMAIL, FILEN_PASSWORD (and optionally FILEN_2FA_CODE) environment variables, if applicable.
	 */
	private async authenticateUsingEnvironment(): Promise<Credentials | undefined> {
		if (process.env.FILEN_EMAIL === undefined) return
		if (process.env.FILEN_PASSWORD === undefined) errExit("Need to also specify environment variable FILEN_PASSWORD")
		outVerbose(`Logging in as ${process.env.FILEN_EMAIL} (using environment variables)`)
		return {
			email: process.env.FILEN_EMAIL,
			password: process.env.FILEN_PASSWORD,
			twoFactorCode: process.env.FILEN_2FA_CODE
		}
	}

	/**
	 * Authenticate using the credentials (and optionally 2FA code) stored in the local `.filen-cli-credentials` file, if applicable.
	 */
	private async authenticateUsingCredentialsFile(): Promise<Credentials | undefined> {
		if (!fsModule.existsSync(".filen-cli-credentials")) return
		const lines = fsModule.readFileSync(".filen-cli-credentials").toString().split("\n")
		if (lines.length < 2) errExit("Invalid .filen-cli-credentials!")
		const twoFactorCode = lines.length > 2 ? lines[2] : undefined
		outVerbose(`Logging in as ${lines[0]} (using .filen-cli-credentials)`)
		return { email: lines[0]!, password: lines[1]!, twoFactorCode }
	}
}
