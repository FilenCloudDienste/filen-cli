// executed as `npm run generateKey`

import crypto from "crypto"
import * as fs from "node:fs"

const keyFile = "key"

crypto.randomBytes(32, (err, buffer) => {
	const key = buffer.toString("hex")
	fs.writeFileSync(keyFile, key)

	console.log("Successfully generated key")
})