import { spawn } from "child_process"
import pkg from "@yao-pkg/pkg"
import * as fs from "node:fs"
import * as PELibrary from "pe-library"
import * as ResEdit from "resedit"
import bpkg from "bpkg"
import path from "path"

console.log(`Build running on ${process.platform}-${process.arch}`)

const buildScriptDirectory = import.meta.dirname
const workingDirectory = path.resolve("./dist")

const targets = [
	{ name: "win-x64", platform: "win32", arch: "x64", parcelWatcherVariant: "win32-x64" },
	{ name: "win-arm64", platform: "win32", arch: "arm64", parcelWatcherVariant: "win32-arm64" },
	{ name: "linux-x64", platform: "linux", arch: "x64", parcelWatcherVariant: "linux-x64" },
	{ name: "linux-arm64", platform: "linux", arch: "arm64", parcelWatcherVariant: "linux-arm64" },
	{ name: "macos-x64", platform: "darwin", arch: "x64", parcelWatcherVariant: "darwin-x64" },
	{ name: "macos-arm64", platform: "darwin", arch: "arm64", parcelWatcherVariant: "darwin-arm64" },
].filter(target => target.platform === process.platform)

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
].filter(dependency => dependency.includes(process.platform))
await executeCommand(`npm install --force ${parcelWatcherDependencies.join(" ")}`)

// build binaries
for (const target of targets) {
	console.log(`\nPackaging for ${target.name}...`)

	// load bundle.js
	let bundle = fs.readFileSync(path.join(workingDirectory, "bundle.js")).toString()

	// inject require statements for `@parcel/watcher-${variant}`
	const injectSnippet = target.name.startsWith("linux")
		? `const { MUSL, family } = require_detect_libc(); binding = family === MUSL ? require("@parcel/watcher-${target.parcelWatcherVariant}-musl") : require("@parcel/watcher-${target.parcelWatcherVariant}-glibc");`
		: `binding = require("@parcel/watcher-${target.parcelWatcherVariant}");`
	bundle = bundle.replace(/binding = require\(name\);/, injectSnippet)

	// write bundle-${variant}.js
	fs.writeFileSync(path.join(workingDirectory, `bundle-${target.name}.js`), bundle)

	// install `keytar` for target
	await executeCommand("npm uninstall --force keytar")
	await executeCommand(`npm install --force keytar --platform=${target.platform} --arch=${target.arch}`)

	// bundle native modules using bpkg
	await bpkg.build({
		env: "node",
		input: path.join(workingDirectory, `bundle-${target.name}.js`),
		output: path.join(workingDirectory, `bundle-${target.name}-2.js`),
		ignoreMissing: true,
		noHeader: true,
		noLicense: true
	})

	// build binary using pkg via SEA
	await pkg.exec(`--sea -t ${target.platform}-${target.arch} -o ${workingDirectory}/filen-cli-${target.name} ${workingDirectory}/bundle-${target.name}-2.js --options max-old-space-size=16384`.split(" "))

	// replace app icon (Windows)
	if (target.platform === "win32") {
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

// remove temporary @parcel/watcher-${variant} and keytar dependencies
await executeCommand(`npm uninstall --force ${parcelWatcherDependencies.join(" ")} keytar`)
await executeCommand("npm install keytar")


// util

function executeCommand(command) {
	const args = command.split(" ")
	return new Promise(resolve => {
		const child = spawn(args[0], args.slice(1), { shell: true })
		child.on("error", err => console.error(err))
		child.on("close", () => resolve())
	})
}