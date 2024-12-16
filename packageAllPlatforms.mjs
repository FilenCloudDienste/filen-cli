import { spawn } from "child_process"
import pkg from "@yao-pkg/pkg"
import * as fs from "node:fs"
import * as PELibrary from "pe-library"
import * as ResEdit from "resedit"
import bpkg from "bpkg"
import path from "path"

const buildScriptDirectory = import.meta.dirname
const workingDirectory = path.resolve("./dist")
const bundleFile = path.join(workingDirectory, "bundle.js")

const onlyWinLinux = process.argv.includes("--only-win-linux")
const onlyMacos = process.argv.includes("--only-macos")
const targets = [
	{ name: "win-x64", pkgTarget: "win32-x64", parcelWatcherVariant: "win32-x64" },
	{ name: "win-arm64", pkgTarget: "win32-arm64", parcelWatcherVariant: "win32-arm64" },
	{ name: "linux-x64", pkgTarget: "linux-x64", parcelWatcherVariant: "linux-x64" },
	{ name: "linux-arm64", pkgTarget: "linux-arm64", parcelWatcherVariant: "linux-arm64" },
	{ name: "macos-x64", pkgTarget: "macos-x64", parcelWatcherVariant: "darwin-x64" },
	{ name: "macos-arm64", pkgTarget: "macos-arm64", parcelWatcherVariant: "darwin-arm64" },
].filter(t => (!onlyWinLinux || t.name.includes("win") || t.name.includes("linux")) && (!onlyMacos || t.name.includes("macos")))

// install temporary @parcel/watcher-${variant} dependencies
const parcelWatcherDependencies = [
	"@parcel/watcher-win32-x64",
	"@parcel/watcher-win32-arm64",
	"@parcel/watcher-linux-x64-musl",
	"@parcel/watcher-linux-x64-glibc",
	"@parcel/watcher-linux-arm64-musl",
	"@parcel/watcher-linux-arm64-glibc",
	"@parcel/watcher-darwin-x64",
	"@parcel/watcher-darwin-arm64"
]
await new Promise(resolve => {
	spawn("npm", ["install", "--force", ...parcelWatcherDependencies], { shell: true })
		.on("error", err => console.error(err))
		.on("close", () => resolve())
})

const placeholderStart = "/* INJECTED DEPENDENCIES PLACEHOLDER >>>>> */"
const placeholderEnd = "/* <<<<< INJECTED DEPENDENCIES PLACEHOLDER */"
const placeholderRegex = /\/\* INJECTED DEPENDENCIES PLACEHOLDER >>>>> \*\/.*\/\* <<<<< INJECTED DEPENDENCIES PLACEHOLDER \*\//s

// prepare bundle file
let bundle = fs.readFileSync(bundleFile).toString()
if (Array.from(bundle.matchAll(/require\(name\);/g)).length !== 1 && Array.from(bundle.matchAll(placeholderRegex)).length !== 1) {
	console.error(`Couldn't find exactly one occurrence of "require(name);" in ${bundleFile}!`)
	process.exit()
}
bundle = bundle.replace("binding = require(name);", `\n${placeholderStart}\n${placeholderEnd}\n`)
fs.writeFileSync(bundleFile, bundle)

// build binaries
for (const target of targets) {
	console.log(`\nPackaging for ${target.name}...`)

	// inject require statements
	let bundle = fs.readFileSync(bundleFile).toString()
	const injectSnippet = target.name.startsWith("linux")
		? `const { MUSL, family } = require_detect_libc(); binding = family === MUSL ? require("@parcel/watcher-${target.parcelWatcherVariant}-musl") : require("@parcel/watcher-${target.parcelWatcherVariant}-glibc");`
		: `binding = require("@parcel/watcher-${target.parcelWatcherVariant}");`
	bundle = bundle.replace(placeholderRegex, `${placeholderStart}\n${injectSnippet}\n${placeholderEnd}`)
	fs.writeFileSync(bundleFile, bundle)

	// bundle native modules using bpkg
	await bpkg.build({
		env: "node",
		input: bundleFile,
		output: path.join(workingDirectory, `bundle-${target.name}.js`),
		ignoreMissing: true
	})

	// build binary using pkg via SEA
	await pkg.exec(`--sea -t ${target.pkgTarget} -o ${workingDirectory}/filen-cli-${target.name} ${workingDirectory}/bundle-${target.name}.js --options max-old-space-size=16384`.split(" "))

	// replace app icon (Windows)
	if (target.pkgTarget.includes("win")) {
		const exe = PELibrary.NtExecutable.from(fs.readFileSync(path.join(workingDirectory, `filen-cli-${target.name}.exe`)), { ignoreCert: true })
		const res = PELibrary.NtExecutableResource.from(exe)
		const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(buildScriptDirectory, "icon.ico")))
		ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
			res.entries,
			ResEdit.Resource.IconGroupEntry.fromEntries(res.entries).map((entry) => entry.id)[0],
			1033, iconFile.icons.map(item => item.data)
		)
		res.outputResource(exe)
		const newBinary = exe.generate()
		fs.writeFileSync(`${workingDirectory}/filen-cli-${target.name}.exe`, Buffer.from(newBinary))
	}
}

// remove temporary dependencies
await new Promise(resolve => {
	spawn("npm", ["remove", "--force", ...parcelWatcherDependencies], { shell: true })
		.on("error", err => console.error(err))
		.on("close", () => resolve())
})