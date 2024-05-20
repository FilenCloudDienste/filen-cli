// executed as part of `npm run build`

import * as fs from "fs"

const version = JSON.parse(fs.readFileSync("package.json").toString()).version
const key = process.env.FILEN_CLI_CRYPTO_BASE_KEY ?? fs.readFileSync("key").toString().split("\n")[0]

const injectionFile = "build/buildInfo.js"
let content = fs.readFileSync(injectionFile).toString()
content = content.replace("{{VERSION}}", version)
content = content.replace("{{CRYPTO_BASE_KEY}}", key)
fs.writeFileSync(injectionFile, content)

console.log("Successfully injected build info")