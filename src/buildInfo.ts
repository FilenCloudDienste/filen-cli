// build info is injected at compile time
// see package.json

export const version: string = "0.0.0"

export const isRunningAsContainer = false

export const isRunningAsNPMPackage = false

export function checkInjectedBuildInfo() {
	return version !== "{{INJECT: VERSION}}"
		&& (isRunningAsContainer.toString() === "true" || isRunningAsContainer.toString() === "false")
		&& (isRunningAsNPMPackage.toString() === "true" || isRunningAsNPMPackage.toString() === "false")
}

//TODO: solve this another way