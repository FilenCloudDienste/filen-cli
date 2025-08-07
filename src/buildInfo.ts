// build info is injected at compile time via bun build --define
declare const VERSION: string
declare const IS_RUNNING_AS_BINARY: boolean
declare const IS_RUNNING_AS_CONTAINER: boolean
declare const IS_RUNNING_AS_NPM_PACKAGE: boolean

export const version = (() => {
	try { return VERSION } catch { return "0.0.0" }
})()
export const isDev = version === "0.0.0" //TODO: remove app.isDev and use this instead
export const isRunningAsBinary = (() => {
	try { return IS_RUNNING_AS_BINARY } catch { return false }
})()
export const isRunningAsContainer = (() => {
	try { return IS_RUNNING_AS_CONTAINER } catch { return false }
})()
export const isRunningAsNPMPackage = (() => {
	try { return IS_RUNNING_AS_NPM_PACKAGE } catch { return false }
})()