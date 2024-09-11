import { spawn } from "child_process"
import pkg from "@yao-pkg/pkg"
import * as fs from "node:fs"
import * as PELibrary from "pe-library"
import * as ResEdit from "resedit"

const local = process.argv.includes("dev")
const bundleFile = "dist/bundle.js"

if (local) console.log(`\`dev\` option: building only for ${process.arch}`)

const targets = [
	{ name: "win-x64", pkgTarget: "win32-x64", dependencies: [ "@parcel/watcher-win32-x64" ] },
	{ name: "win-arm64", pkgTarget: "win32-arm64", dependencies: [ "@parcel/watcher-win32-arm64" ] },
	{ name: "linux-x64", pkgTarget: "linux-x64", dependencies: [ "@parcel/watcher-linux-x64-glibc", "@parcel/watcher-linux-x64-musl" ] },
	{ name: "linux-arm64", pkgTarget: "linux-arm64", dependencies: [ "@parcel/watcher-linux-arm64-glibc", "@parcel/watcher-linux-arm64-musl" ] },
	{ name: "macos-x64", pkgTarget: "macos-x64", dependencies: [ "@parcel/watcher-darwin-x64" ] },
	{ name: "macos-arm64", pkgTarget: "macos-arm64", dependencies: [ "@parcel/watcher-darwin-arm64" ] },
].filter(t => !local || t.name.includes(process.arch))

// install temporary dependencies
await new Promise(resolve => {
	spawn("npm", ["install", "--force", ...targets.flatMap(t => t.dependencies)], { shell: true })
		.on("error", err => console.error(err))
		.on("close", () => resolve())
})

const placeholderStart = "/* INJECTED DEPENDENCIES PLACEHOLDER >>>>> */"
const placeholderEnd = "/* <<<<< INJECTED DEPENDENCIES PLACEHOLDER */"
const placeholderRegex = /\/\* INJECTED DEPENDENCIES PLACEHOLDER >>>>> \*\/.*\/\* <<<<< INJECTED DEPENDENCIES PLACEHOLDER \*\//s

// prepare bundle file
let bundle = fs.readFileSync(bundleFile).toString()
bundle = bundle.replace("\"use strict\";", `"use strict";\n\n${placeholderStart}\n${placeholderEnd}\n`)
fs.writeFileSync(bundleFile, bundle)

// build binaries
for (const target of targets) {
	console.log(`Packaging for ${target.name}...`)

	// inject require statements
	let bundle = fs.readFileSync(bundleFile).toString()
	bundle = bundle.replace(placeholderRegex, `${placeholderStart}\n${target.dependencies.map(d => `if (false) require("${d}");`).join("\n")}\n${placeholderEnd}`)
	fs.writeFileSync(bundleFile, bundle)

	await pkg.exec(`-t ${target.pkgTarget} -o dist/filen-cli-${target.name} dist/bundle.js --options max-old-space-size=16384`.split(" "))

	// replace app icon (Windows)
	if (target.pkgTarget.includes("win")) {
		const exe = PELibrary.NtExecutable.from(fs.readFileSync(`dist/filen-cli-${target.name}.exe`))
		const res = PELibrary.NtExecutableResource.from(exe)
		const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync("icon.ico"))
		ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
			res.entries,
			ResEdit.Resource.IconGroupEntry.fromEntries(res.entries).map((entry) => entry.id)[0],
			1033, iconFile.icons.map(item => item.data)
		)
		res.outputResource(exe)
		const newBinary = exe.generate()
		fs.writeFileSync(`dist/filen-cli-${target.name}.exe`, Buffer.from(newBinary))
	}
}

if (local) {
	// remove require statements
	bundle = fs.readFileSync(bundleFile).toString().replace(placeholderRegex, "")
	fs.writeFileSync(bundleFile, bundle)

	// remove temporary dependencies
	await new Promise(resolve => {
		spawn("npm", ["remove", ...targets.flatMap(t => t.dependencies)], { shell: true })
			.on("error", err => console.error(err))
			.on("close", () => resolve())
	})
}