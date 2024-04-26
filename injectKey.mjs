// executed as part of `npm run package`

import * as fs from "fs"

const keyFile = "key"
const injectionFile = "build/key.js"

const key = process.env.FILEN_CLI_CRYPTO_BASE_KEY ?? fs.readFileSync(keyFile).toString().split("\n")[0]

let content = fs.readFileSync(injectionFile).toString()
content = content.replace("{{CRYPTO_BASE_KEY}}", key)
fs.writeFileSync(injectionFile, content)

console.log("Successfully injected key")