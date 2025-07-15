import "dotenv/config" // authenticate from FILEN_EMAIL and FILEN_PASSWORD via .env
import path from "path"
import FilenSDK, { FilenSDKConfig } from "@filen/sdk"
import { app } from "../app/app"
import { X } from "../app/f"
import { InterfaceAdapter } from "../framework/app"
import { buildF, EmptyX, Extra, Feature, FeatureContext, FeatureGroup } from "../framework/features"
import { CloudPath } from "../app/util/cloudPath"
import { randomUUID } from "crypto"

export const testingRootPath = new CloudPath(["filen-cli-testing"])
export const testDir = path.resolve("testing")

export function mockFrameworkApp<X extends Extra = EmptyX>(features: (f: ReturnType<typeof buildF<X>>) => (Feature<X> | FeatureGroup<X>)[], consoleOutput: boolean = false) {
    const f = buildF<X>()
    const { adapter, output } = mockInterfaceAdapter({ input: [], consoleOutput })
    const app = f.app({
        info: { name: "MyName", version: "0.0.0" },
        argv: [],
        adapter,
        features: features(f),
        defaultCtx: {},
        mainFeature: { cmd: [], description: null, arguments: [], invoke: async () => {} },
    }).app()
    return {
        f, app, 
        adapter, output,
    }
}

export async function runMockApp(...args: Parameters<typeof mockApp>) {
    const mock = await mockApp(...args)
    const isError = await mock.run()
    return { ...mock, isError }
}

export async function mockApp({ ctx, cmd, input, consoleOutput, unauthenticated, root, dataDir }: { ctx?: Partial<FeatureContext<X>>, cmd?: string, input?: string[], consoleOutput?: boolean, unauthenticated?: boolean, root?: CloudPath, dataDir?: string } = {}) {
    process.env.FILEN_CLI_DATA_DIR = dataDir ?? path.join(testDir, "dataDirShouldStayEmpty")
    const { adapter, input: adapterInput, isInputEmpty, output } = mockInterfaceAdapter({ input, consoleOutput })
    const argv = ["--dev", ...(consoleOutput ? ["--verbose"] : []), ...(cmd?.split(" ") ?? [])]
    const filen = unauthenticated ? unauthenticatedFilenSDK() : await authenticatedFilenSDK()
    const x = { filen, cloudWorkingPath: root ?? testingRootPath, ...ctx?.x }
    await (await authenticatedFilenSDK()).fs().mkdir({ path: x.cloudWorkingPath.toString() })
    const _app = app(argv, adapter).mockApp(x)
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
            x,
            ...ctx,
        } satisfies FeatureContext<X> as FeatureContext<X>,
        input: adapterInput, isInputEmpty, output,
        runWithStatus: async () => await _app.main(),
        run: async () => {
            const ok = await _app.main()
            if (!ok) throw Error(`Exit error: ${output()}`)
        }
    }
}
export type MockApp = Awaited<ReturnType<typeof mockApp>>

export function mockInterfaceAdapter({ input, consoleOutput }: { input?: string[], consoleOutput?: boolean }) {
    const adapter = new MockInterfaceAdapter(input ?? [], consoleOutput ?? false)
    return {
        adapter,
        input: (input: string | string[]) => Array.isArray(input) ? adapter.input.push(...input) : adapter.input.push(input),
        isInputEmpty: () => adapter.input.length === 0,
        labelledOutput: () => adapter.totalOutput,
        output: () => adapter.totalOutputRaw,
    }
}
export class MockInterfaceAdapter implements InterfaceAdapter {
    constructor(public input: string[], public output: boolean) {}

    public totalOutput = ""
    public totalOutputRaw = ""
    private totalErrorOutput = ""
    private appendOutput(message: string, label: string = " ") {
        const labeledMessage = message.split("\n").map(line => label + " " + line).join("\n")
        this.totalOutput += labeledMessage + "\n"
        this.totalOutputRaw += message + "\n"
        if (label === "E") this.totalErrorOutput += labeledMessage + "\n"
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
    if (process.env.FILEN_CLI_TESTING_AUTHCONFIG) {
        const authConfig = JSON.parse(Buffer.from(process.env.FILEN_CLI_TESTING_AUTHCONFIG, "base64").toString()) as FilenSDKConfig
        filen.init(authConfig)
    } else {
        await filen.login(getCredentials())
    }
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

export class ResourceLock {
    private lockUUID = randomUUID()
    public constructor(private resourceName: string) {}
    public async acquire() {
        return (await authenticatedFilenSDK()).user().acquireResourceLock({ resource: `filen-cli-testing_${this.resourceName}`, lockUUID: this.lockUUID })
    }
    public async release() {
        return (await authenticatedFilenSDK()).user().releaseResourceLock({ resource: `filen-cli-testing_${this.resourceName}`, lockUUID: this.lockUUID })
    }
}