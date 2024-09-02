import path from "path"
import fsModule from "node:fs"
import crypto from "node:crypto"
import { platformConfigPath } from "../util/util"
import { key } from "../buildInfo"
import { FilenSDKConfig } from "@filen/sdk"
import { errExit } from "../interface/interface"

/**
 * Handles cryptography for securely storing credentials in a file.
 */
export class CredentialsCrypto {
	private readonly key
	private readonly salt

	public constructor() {
		this.key = key

		try {
			const saltFile = path.join(platformConfigPath(), ".credentials.salt")
			if (!fsModule.existsSync(saltFile)) {
				this.salt = crypto.randomBytes(32).toString("hex")
				fsModule.writeFileSync(saltFile, this.salt)
			} else {
				this.salt = fsModule.readFileSync(saltFile).toString()
			}
		} catch (e) {
			errExit("initialize salt for credentials cryptography", e)
		}
	}

	/**
	 * Derive the encryption key based on the packed key and generated salt.
	 */
	private deriveEncryptionKey(): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			crypto.pbkdf2(this.key, this.salt, 600_000, 256 / 8, "sha512", (err, derivedKey) => {
				if (err) reject(err)
				else resolve(derivedKey)
			})
		})
	}

	/**
	 * Encrypt credentials.
	 */
	public async encrypt(credentials: FilenSDKConfig): Promise<string> {
		const derivedKey = await this.deriveEncryptionKey()
		const iv = crypto.randomBytes(12)
		const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv)
		const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials)), cipher.final()])
		const authTag = cipher.getAuthTag()
		return Buffer.concat([iv, encrypted, authTag]).toString("hex")
	}

	/**
	 * Decrypt credentials.
	 */
	public async decrypt(encrypted: string): Promise<FilenSDKConfig> {
		const derivedKey = await this.deriveEncryptionKey()
		const data = Buffer.from(encrypted, "hex")
		const iv = data.subarray(0, 12)
		const encData = data.subarray(12)
		const authTag = encData.subarray(-16)
		const ciphertext = encData.subarray(0, encData.byteLength - 16)
		const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv)
		decipher.setAuthTag(authTag)
		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8")
		return JSON.parse(decrypted) as FilenSDKConfig
	}
}
