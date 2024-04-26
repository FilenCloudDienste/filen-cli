import path from "path"
import fsModule from "node:fs"

/**
 * Handles cryptography for securely storing credentials in a file.
 */
export class CredentialsCrypto {
	private readonly key
	private readonly salt

	public constructor() {
		let keyFile = path.join(__dirname, "../key")
		//eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((process as any)["pkg"]) { // is packaged
			keyFile = path.join(__dirname, "../dist/key")
		}
		const hexKey = fsModule.readFileSync(keyFile).toString()
		this.key = Buffer.from(hexKey.toString(), "hex")

		//TODO CRYPTO
		this.salt = ""
	}

	/**
	 * Encrypt credentials.
	 * @param credentials The hex string to be stored
	 */
	public encrypt(credentials: { email: string, password: string }) {
		//TODO CRYPTO
		return Buffer.from(JSON.stringify(credentials) + " --- " + this.key.toString("hex")).toString("hex")
	}

	/**
	 * Decrypt credentials.
	 * @param encrypted The stored hex string
	 */
	public decrypt(encrypted: string) {
		//TODO CRYPTO
		console.log("decrypted:", Buffer.from(encrypted, "hex").toString())
		return JSON.parse(Buffer.from(encrypted, "hex").toString().split(" --- ")[0]) as {
			email: string,
			password: string
		}
	}
}