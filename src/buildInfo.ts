// build info is injected at compile time
// see package.json

export const version: string = "{{INJECT: VERSION}}"

// @ts-expect-error will be injected
export const disableAutomaticUpdates: boolean = "{{INJECT: IS_CONTAINER}}"

export const key: string = "{{INJECT: CRYPTO_BASE_KEY}}"