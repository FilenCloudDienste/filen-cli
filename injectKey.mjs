// executed as part of `npm run package`

import crypto from "crypto"
import * as fs from "fs"

const keyFile = "build/key.js"

crypto.randomBytes(32, (err, buffer) => {
	const key = buffer.toString("hex")

	let content = fs.readFileSync(keyFile).toString()
	content = content.replace("{{CRYPTO_BASE_KEY}}", key)
	fs.writeFileSync(keyFile, content)

	console.log("Successfully injected key")
})