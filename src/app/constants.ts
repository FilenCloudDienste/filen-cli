import { type FilenSDKConfig } from "@filen/sdk"

export const ANONYMOUS_SDK_CONFIG: FilenSDKConfig = {
	email: "anonymous",
	password: "anonymous",
	masterKeys: ["anonymous"],
	connectToSocket: true,
	metadataCache: true,
	twoFactorCode: "anonymous",
	publicKey: "anonymous",
	privateKey: "anonymous",
	apiKey: "anonymous",
	authVersion: 2,
	baseFolderUUID: "anonymous",
	userId: 1
} as const satisfies FilenSDKConfig
