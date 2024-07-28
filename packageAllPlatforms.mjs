import { spawn } from "child_process"
import pkg from "@yao-pkg/pkg"
import * as fs from "node:fs"

const bundleFile = "dist/bundle.js"

const targets = [
	{ name: "win-x64", pkgTarget: "win32-x64", dependencies: [ "@parcel/watcher-win32-x64" ] },
	// { name: "win-arm64", pkgTarget: "win32-arm64", parcelWatcherTarget: "win32-arm64" },
	{ name: "linux-x64", pkgTarget: "linux-x64", dependencies: [ "@parcel/watcher-linux-x64-glibc" ] },
	// { name: "linux-arm64-glibc", pkgTarget: "linux-arm64", parcelWatcherTarget: "linux-arm64-glibc" },
	// { name: "linux-x64-musl", pkgTarget: "linux-x64", dependencies: [ "@parcel/watcher-linux-x64-musl" ] },
	// { name: "linux-arm64-musl", pkgTarget: "linux-arm64", parcelWatcherTarget: "linux-arm64-musl " },
	{ name: "macos-x64", pkgTarget: "macos-x64", dependencies: [ "@parcel/watcher-darwin-x64" ] },
	// { name: "macos-arm64", pkgTarget: "macos-arm64", parcelWatcherTarget: "darwin-arm64" },
]

// install temporary dependencies
await new Promise((resolve, _) => {
	spawn("npm", ["install", "--save-dev", "--force", ...targets.flatMap(t => t.dependencies)], { shell: true })
		.on("error", err => console.error(err))
		.on("close", () => resolve())
})

const placeholderStart = "/* INJECTED DEPENDENCIES PLACEHOLDER >>>>> */"
const placeholderEnd = "/* <<<<< INJECTED DEPENDENCIES PLACEHOLDER */"

// prepare bundle file
let bundle = fs.readFileSync(bundleFile).toString()
bundle = bundle.replace("\"use strict\";", `"use strict";\n\n${placeholderStart}\n${placeholderEnd}\n`)
fs.writeFileSync(bundleFile, bundle)

// build binaries
for (const target of targets) {
	console.log(`Packaging for ${target.name}...`)

	// inject require statements
	let bundle = fs.readFileSync(bundleFile).toString()
	bundle = bundle.replace(
		/\/\* INJECTED DEPENDENCIES PLACEHOLDER >>>>> \*\/.*\/\* <<<<< INJECTED DEPENDENCIES PLACEHOLDER \*\//s,
		`${placeholderStart}\n${target.dependencies.map(d => `if (false) require("${d}");`).join("\n")}\n${placeholderEnd}`
	)
	fs.writeFileSync(bundleFile, bundle)

	await pkg.exec(`-t ${target.pkgTarget} -o dist/filen-cli-${target.name} dist/bundle.js`.split(" "))
}

// remove bundle.js
fs.rmSync(bundleFile)

// remove temporary dependencies
await new Promise((resolve, _) => {
	spawn("npm", ["remove", ...targets.flatMap(t => t.dependencies)], { shell: true })
		.on("error", err => console.error(err))
		.on("close", () => resolve())
})