import "dotenv/config" // authenticate from FILEN_EMAIL and FILEN_PASSWORD via .env
import path from "path"
import FilenSDK, { FilenSDKConfig } from "@filen/sdk"
import fs from "fs/promises"
import { rimraf } from "rimraf"
import { app, X } from "../app/app"
import { InterfaceAdapter } from "../framework/app"
import { FeatureContext } from "../framework/features"
import { CloudPath } from "../app/util/cloudPath"

export const testDir = path.resolve("testing")
export const testDataDir = path.join(testDir, "dataDir")
export async function clearTestDir() {
    await rimraf(testDir)
    await fs.mkdir(testDir, { recursive: true })
    await fs.mkdir(testDataDir, { recursive: true })
}

export async function runMockApp(...args: Parameters<typeof mockApp>) {
    const mock = await mockApp(...args)
    const isError = await mock.run()
    return { ...mock, isError }
}

export async function mockApp({ ctx, cmd, input, consoleOutput, unauthenticated }: { ctx?: Partial<FeatureContext<X>>, cmd?: string, input?: string[], consoleOutput?: boolean, unauthenticated?: boolean }) {
    process.env.FILEN_CLI_DATA_DIR = testDataDir
    const adapter = new MockInterfaceAdapter(input ?? [], consoleOutput ?? false)
    const argv = cmd?.split(" ") ?? []
    const _app = app(argv, adapter)
    const filen = unauthenticated ? unauthenticatedFilenSDK() : await authenticatedFilenSDK()
    return {
        app: _app,
        filen,
        ctx: {
            app: _app,
            argv,
            verbose: false,
            quiet: false,
            formatJson: false,
            isInteractiveMode: false,
            ...ctx,
            x: { filen, cloudWorkingPath: new CloudPath([]), ...ctx?.x },
        } satisfies FeatureContext<X> as FeatureContext<X>,
        input: (input: string | string[]) => Array.isArray(input) ? adapter.input.push(...input) : adapter.input.push(input),
        isInputEmpty: () => adapter.input.length === 0,
        output: () => adapter.totalOutput,
        run: async () => await _app.main(),
    }
}
export type MockApp = Awaited<ReturnType<typeof mockApp>>

class MockInterfaceAdapter implements InterfaceAdapter {
    constructor(public input: string[], public output: boolean) {}

    public totalOutput = ""
    private totalErrorOutput = ""
    private appendOutput(message: string, label: string = " ") {
        message = message.split("\n").map(line => label + " " + line).join("\n")
        this.totalOutput += message + "\n"
        if (label === "E") this.totalErrorOutput += message + "\n"
    }

    out(message: string) {
        if (this.output) console.log(message)
        this.appendOutput(message)
    }
    outJson(json: unknown) {
        if (this.output) console.log(json)
        this.appendOutput(JSON.stringify(json, null, 2), "J")
    }
    errOut(message: string) {
        if (this.output) console.error(message)
        this.appendOutput(message, "E")
    }
    err(error: unknown) {
        if (this.output) console.error(error instanceof Error ? error.stack : error)
        this.appendOutput((error instanceof Error ? error.stack : undefined) ?? String(error), "E")
    }
    prompt(message: string) {
        return new Promise<string>(resolve => {
            if (this.input.length > 0) {
                const input = this.input.shift()!
                resolve(input)
                this.appendOutput(message)
                this.appendOutput(input, "I")
            } else {
                throw new Error("No mock input provided for: " + message)
            }
        })
    }
    addInterruptListener() {}
}

export class Exit extends Error {}

export function unauthenticatedFilenSDK() {
    return new FilenSDK({
        ...ANONYMOUS_SDK_CONFIG,
        connectToSocket: true,
        metadataCache: true,
        tmpPath: path.join(testDir, "tmpdir")
    })
}

let _authenticatedFilenSDK: FilenSDK | undefined = undefined
export async function authenticatedFilenSDK() {
    if (_authenticatedFilenSDK !== undefined) {
        return _authenticatedFilenSDK
    }
    const filen = unauthenticatedFilenSDK()
    await filen.login(getCredentials())
    _authenticatedFilenSDK = filen
    return filen
}

export function getCredentials() {
    const email = process.env.FILEN_CLI_TESTING_EMAIL
    const password = process.env.FILEN_CLI_TESTING_PASSWORD
    if (!email || !password) {
        throw Error("Please set FILEN_CLI_TESTING_EMAIL and FILEN_CLI_TESTING_PASSWORD in your .env file.")
    }
    return { email, password }
}

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
} as const