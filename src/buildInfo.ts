// build info is injected at compile time
// see package.json

export const version: string = "{{INJECT: VERSION}}"

// @ts-expect-error will be injected
export const disableUpdates: boolean = "{{INJECT: IS_CONTAINER}}"

// @ts-expect-error will be injected
export const isRunningAsNPMPackage: boolean = "{{INJECT: IS_NPM_PACKAGE}}"

export const key: string = "{{INJECT: CRYPTO_BASE_KEY}}"

export function checkInjectedBuildInfo() {
	return version !== "{{INJECT: VERSION}}"
		&& (disableUpdates.toString() === "true" || disableUpdates.toString() === "false")
		&& (isRunningAsNPMPackage.toString() === "true" || isRunningAsNPMPackage.toString() === "false")
		&& key !== "{{INJECT: CRYPTO_BASE_KEY}}"
}