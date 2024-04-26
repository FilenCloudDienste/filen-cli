import FilenSDK, { APIError } from "@filen/sdk"
import { errExit, out, prompt } from "./interface"
import fsModule from "node:fs"
import { exists, platformConfigPath } from "./util"
import path from "path"
import { CredentialsCrypto } from "./credentialsCrypto"

type Credentials = {
	email: string,
	password: string,
	twoFactorCode?: string
}

/**
 * Handles authentication.
 */
export class Authentication {
	private readonly filen: FilenSDK
	private readonly verbose: boolean

	private readonly crypto = new CredentialsCrypto()
	private readonly credentialsDirectory = path.join(platformConfigPath(), "filen-cli")
	private readonly credentialsFile = path.join(this.credentialsDirectory, "filen-cli-credentials")

	public constructor(filen: FilenSDK, verbose: boolean) {
		this.filen = filen
		this.verbose = verbose
	}

	/**
	 * Delete credentials stored in a file
	 */
	public async deleteStoredCredentials() {
		await fsModule.promises.unlink(this.credentialsFile)
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
		const authenticationMethods = [
			async () => await this.authenticateUsingArguments(emailArg, passwordArg, twoFactorCodeArg),
			async () => await this.authenticateUsingEnvironment(),
			async () => await this.authenticateUsingStoredCredentials(),
			async () => await this.authenticateUsingFile(),
			async () => await this.authenticateUsingPrompt()
		]
		let credentials: Credentials
		for (const authenticate of authenticationMethods) {
			const result = await authenticate()
			if (result !== undefined) {
				credentials = result
				break
			}
		}
		try {
			await this.filen.login(credentials!)
		} catch (e) {
			if (!(e instanceof APIError)) throw e
			if ((e as APIError).code !== "enter_2fa") throw e
			const twoFactorCode = await prompt("Please enter your 2FA code: ")
			await this.filen.login({ ...credentials!, twoFactorCode })
		}
	}

	/**
	 * Authenticate using the `--email`, `--password` (and optionally `--two-factor-code`) CLI arguments, if applicable.
	 */
	private async authenticateUsingArguments(email: string | undefined, password: string | undefined, twoFactorCodeArg: string | undefined): Promise<Credentials | undefined> {
		if (email === undefined) return
		if (password === undefined) return errExit("Need to also specify argument --password")
		if (this.verbose) out(`Logging in as ${email} (using arguments)`)
		return { email, password, twoFactorCode: twoFactorCodeArg }
	}

	/**
	 * Authenticate using the FILEN_EMAIL, FILEN_PASSWORD (and optionally FILEN_2FA_CODE) environment variables, if applicable.
	 */
	private async authenticateUsingEnvironment(): Promise<Credentials | undefined> {
		if (process.env.FILEN_EMAIL === undefined) return
		if (process.env.FILEN_PASSWORD === undefined) errExit("Need to also specify environment variable FILEN_PASSWORD")
		if (this.verbose) out(`Logging in as ${process.env.FILEN_EMAIL} (using environment variables)`)
		return {
			email: process.env.FILEN_EMAIL,
			password: process.env.FILEN_PASSWORD,
			twoFactorCode: process.env.FILEN_2FA_CODE
		}
	}

	/**
	 * Authenticate using the credentials stored a file, if applicable.
	 */
	private async authenticateUsingStoredCredentials(): Promise<Credentials | undefined> {
		if (!(await exists(this.credentialsFile))) return
		const encryptedCredentials = (await fsModule.promises.readFile(this.credentialsFile)).toString()
		const credentials = this.crypto.decrypt(encryptedCredentials)
		if (this.verbose) out(`Logging in as ${credentials.email} (using saved credentials)`)
		return credentials
	}

	/**
	 * Authenticate using the credentials (and optionally 2FA code) stored in the local `.filen-cli-credentials` file, if applicable.
	 */
	private async authenticateUsingFile(): Promise<Credentials | undefined> {
		if (!fsModule.existsSync(".filen-cli-credentials")) return
		const lines = fsModule.readFileSync(".filen-cli-credentials").toString().split("\n")
		if (lines.length < 2) errExit("Invalid .filen-cli-credentials!")
		const twoFactorCode = lines.length > 2 ? lines[2] : undefined
		if (this.verbose) out(`Logging in as ${lines[0]} (using .filen-cli-credentials)`)
		return { email: lines[0], password: lines[1], twoFactorCode }
	}

	/**
	 * Prompt the user for credentials.
	 */
	private async authenticateUsingPrompt(): Promise<Credentials> {
		out("Please enter your Filen credentials:")
		const email = await prompt("Email: ")
		const password = await prompt("Password: ")
		if (!email || !password) errExit("Please provide your credentials!")

		const saveCredentials = (await prompt("Save credentials locally for future invocations? [y/N] ")).toLowerCase() === "y"
		if (saveCredentials) {
			if (!(await exists(this.credentialsDirectory))) await fsModule.promises.mkdir(this.credentialsDirectory, { recursive: true })
			const encryptedCredentials = this.crypto.encrypt({ email, password })
			await fsModule.promises.writeFile(this.credentialsFile, encryptedCredentials)
			out("You can delete these credentials using `filen --delete-credentials`")
		}

		out("")
		return { email, password }
	}
}