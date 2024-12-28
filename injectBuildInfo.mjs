// executed as part of `npm run build`

import * as fs from "fs"

const version = JSON.parse(fs.readFileSync("package.json").toString()).version
const isContainer = process.env.FILEN_IS_CONTAINER === "true"

const injectionFile = "build/buildInfo.js"
let content = fs.readFileSync(injectionFile).toString()
const buildInfo = {
	VERSION: `"${version}"`,
	IS_CONTAINER: `${isContainer}`,
}
Object.entries(buildInfo).forEach(entry => {
	content = content.replace(`"{{INJECT: ${entry[0]}}}"`, entry[1])
})
fs.writeFileSync(injectionFile, content)

console.log("Successfully injected build info")