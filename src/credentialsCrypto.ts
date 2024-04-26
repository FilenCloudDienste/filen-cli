import path from "path"
import fsModule from "node:fs"
import crypto from "node:crypto"
import { platformConfigPath } from "./util"
import { type Credentials } from "./auth"

/**
 * Handles cryptography for securely storing credentials in a file.
 *
 * @export
 * @class CredentialsCrypto
 * @typedef {CredentialsCrypto}
 */
export class CredentialsCrypto {
	private readonly key
	private readonly salt

	/**
	 * Creates an instance of CredentialsCrypto.
	 *
	 * @constructor
	 * @public
	 */
	public constructor() {
		let keyFile = path.join(__dirname, "../key")

		if (process.pkg) {
			// is packaged
			keyFile = path.join(__dirname, "../dist/key")
		}

		const hexKey = fsModule.readFileSync(keyFile, {
			encoding: "utf-8"
		})

		this.key = hexKey
		this.salt = this.generateSalt()
	}

	/**
	 * Generate a random salt used for key derivation.
	 *
	 * @public
	 * @returns {string}
	 */
	public generateSalt(): string {
		const saltFilePath = path.join(platformConfigPath(), ".credentials.salt")

		if (!fsModule.existsSync(saltFilePath)) {
			const salt = crypto.randomBytes(32).toString("hex")

			fsModule.writeFileSync(saltFilePath, salt)

			return salt
		}

		return fsModule.readFileSync(saltFilePath).toString("hex")
	}

	/**
	 * Derive the encryption key based on the predefined key and generated salt.
	 *
	 * @public
	 * @returns {Promise<Buffer>}
	 */
	public deriveEncryptionKey(): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			crypto.pbkdf2(this.key, this.salt, 600_000, 256 / 8, "sha512", (err, derivedKey) => {
				if (err) {
					reject(err)

					return
				}

				resolve(derivedKey)
			})
		})
	}

	/**
	 * Encrypt credentials.
	 *
	 * @public
	 * @async
	 * @param {Credentials} credentials
	 * @returns {Promise<string>}
	 */
	public async encrypt(credentials: Credentials): Promise<string> {
		const derivedKey = await this.deriveEncryptionKey()
		const iv = crypto.randomBytes(12)
		const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv)
		const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials)), cipher.final()])
		const authTag = cipher.getAuthTag()

		return Buffer.concat([iv, encrypted, authTag]).toString("hex")
	}

	/**
	 * Decrypt credentials.
	 *
	 * @public
	 * @async
	 * @param {string} encrypted
	 * @returns {Promise<Credentials>}
	 */
	public async decrypt(encrypted: string): Promise<Credentials> {
		const derivedKey = await this.deriveEncryptionKey()
		const data = Buffer.from(encrypted, "hex")
		const iv = data.subarray(0, 12)
		const encData = data.subarray(12)
		const authTag = encData.subarray(-16)
		const ciphertext = encData.subarray(0, encData.byteLength - 16)
		const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv)

		decipher.setAuthTag(authTag)

		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8")

		return JSON.parse(decrypted)
	}
}
