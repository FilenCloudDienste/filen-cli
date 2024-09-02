import FilenSDK, { APIError } from "@filen/sdk"
import { err, errExit, out, prompt, verbose } from "../interface/interface"
import fsModule from "node:fs"
import { exists, platformConfigPath } from "../util/util"
import path from "path"
import { CredentialsCrypto } from "./credentialsCrypto"

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
	private readonly credentialsDirectory = platformConfigPath()
	private readonly credentialsFile = path.join(this.credentialsDirectory, ".credentials")

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
	 */
	public async authenticate(emailArg: string | undefined, passwordArg: string | undefined, twoFactorCodeArg: string | undefined) {
		// try to get credentials from args, environment and file
		let credentials: Credentials | undefined = undefined
		for (const authenticate of [
			async () => await this.authenticateUsingArguments(emailArg, passwordArg, twoFactorCodeArg),
			async () => await this.authenticateUsingEnvironment(),
			async () => await this.authenticateUsingFile()
		]) {
			credentials = await authenticate()
			if (credentials !== undefined) break
		}

		// otherwise: get credentials from file
		if (credentials === undefined && await exists(this.credentialsFile)) {
			const encryptedConfig = await fsModule.promises.readFile(this.credentialsFile, { encoding: "utf-8" })
			try {
				const config = await this.crypto.decrypt(encryptedConfig)
				if (verbose) out(`Logging in as ${config.email} (using saved credentials)`)
				this.filen.init(config)
				if (await this.filen.user().checkAPIKeyValidity()) {
					return
				} else {
					if (verbose) err("Invalid saved API key! Need to log in again.")
				}
			} catch (e) {
				err("login from saved credentials", e, "try `filen --delete-credentials`")
			}
		}

		// otherwise: get credentials from prompt
		const authenticateUsingPrompt = credentials === undefined
		if (authenticateUsingPrompt) {
			out("Please enter your Filen credentials:")
			const email = await prompt("Email: ")
			const password = await prompt("Password: ", false, true)
			if (!email || !password) errExit("Please provide your credentials!")
			credentials = { email, password }
		}

		// try to log in, optionally prompt for 2FA
		try {
			try {
				await this.filen.login(credentials!)
			} catch (e) {
				if (e instanceof APIError && e.code === "enter_2fa") {
					const twoFactorCode = await prompt("Please enter your 2FA code: ")
					await this.filen.login({ ...credentials!, twoFactorCode })
				} else {
					throw e
				}
			}
		} catch (e) {
			if (e instanceof APIError && e.code === "email_or_password_wrong") {
				errExit("Invalid credentials!")
			} else {
				errExit("login", e)
			}
		}

		// save credentials from prompt
		if (authenticateUsingPrompt) {
			const saveCredentials = (await prompt("Save credentials locally for future invocations? [y/N] ")).toLowerCase() === "y"
			if (saveCredentials) {
				try {
					const encryptedCredentials = await this.crypto.encrypt(this.filen.config)
					if (!(await exists(this.credentialsDirectory))) await fsModule.promises.mkdir(this.credentialsDirectory)
					await fsModule.promises.writeFile(this.credentialsFile, encryptedCredentials)
					out("You can delete these credentials using `filen --delete-credentials`")
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
		if (verbose) out(`Logging in as ${email} (using arguments)`)
		return { email, password, twoFactorCode: twoFactorCodeArg }
	}

	/**
	 * Authenticate using the FILEN_EMAIL, FILEN_PASSWORD (and optionally FILEN_2FA_CODE) environment variables, if applicable.
	 */
	private async authenticateUsingEnvironment(): Promise<Credentials | undefined> {
		if (process.env.FILEN_EMAIL === undefined) return
		if (process.env.FILEN_PASSWORD === undefined) errExit("Need to also specify environment variable FILEN_PASSWORD")
		if (verbose) out(`Logging in as ${process.env.FILEN_EMAIL} (using environment variables)`)
		return {
			email: process.env.FILEN_EMAIL,
			password: process.env.FILEN_PASSWORD,
			twoFactorCode: process.env.FILEN_2FA_CODE
		}
	}

	/**
	 * Authenticate using the credentials (and optionally 2FA code) stored in the local `.filen-cli-credentials` file, if applicable.
	 */
	private async authenticateUsingFile(): Promise<Credentials | undefined> {
		if (!fsModule.existsSync(".filen-cli-credentials")) return
		const lines = fsModule.readFileSync(".filen-cli-credentials").toString().split("\n")
		if (lines.length < 2) errExit("Invalid .filen-cli-credentials!")
		const twoFactorCode = lines.length > 2 ? lines[2] : undefined
		if (verbose) out(`Logging in as ${lines[0]} (using .filen-cli-credentials)`)
		return { email: lines[0]!, password: lines[1]!, twoFactorCode }
	}
}
