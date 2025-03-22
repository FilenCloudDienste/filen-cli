// build info is injected at compile time
// see package.json

export const version: string = "{{INJECT: VERSION}}"

// @ts-expect-error will be injected
export const isRunningAsContainer: boolean = "{{INJECT: IS_CONTAINER}}"

// @ts-expect-error will be injected
export const isRunningAsNPMPackage: boolean = "{{INJECT: IS_NPM_PACKAGE}}"

export function checkInjectedBuildInfo() {
	return version !== "{{INJECT: VERSION}}"
		&& (isRunningAsContainer.toString() === "true" || isRunningAsContainer.toString() === "false")
		&& (isRunningAsNPMPackage.toString() === "true" || isRunningAsNPMPackage.toString() === "false")
}