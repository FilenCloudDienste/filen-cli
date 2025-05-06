import "dotenv/config" // authenticate from FILEN_EMAIL and FILEN_PASSWORD via .env
import path from "path"
import { ANONYMOUS_SDK_CONFIG } from "../constants"
import FilenSDK from "@filen/sdk"
import { App, InterfaceAdapter } from "../app"
import fs from "fs/promises"
import { rimraf } from "rimraf"

export const testDir = path.resolve("testing")
export const testDataDir = path.join(testDir, "dataDir")
export async function clearTestDir() {
    await rimraf(testDir)
    await fs.mkdir(testDir, { recursive: true })
    await fs.mkdir(testDataDir, { recursive: true })
}

export async function run(cmd: string = "", input: string[] = [], consoleOutput: boolean = false): Promise<{ output: string, isError: boolean }> {
    const app = new MockApp(cmd, input, consoleOutput)
    const isError = !(await app.main())
    return  { output: app.output(), isError }
}

export class MockApp extends App {
    private _adapter: MockInterfaceAdapter

    constructor(private cmd: string = "", input: string[] = [], consoleOutput: boolean = false) {
        process.env.FILEN_CLI_DATA_DIR = testDataDir
        const adapter = new MockInterfaceAdapter(input, consoleOutput)
        super(`${cmd}`.split(" "), adapter)
        this._adapter = adapter
    }

    public showConsoleOutput() {
        this._adapter.output = true
    }

    public input(input: string[] | string) {
        if (Array.isArray(input)) {
            this._adapter.input.push(...input)
        } else {
            this._adapter.input.push(input)
        }
    }
    public isInputEmpty() {
        return this._adapter.input.length === 0
    }

    public output() {
        return this._adapter.totalOutput
    }
}

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
    await filen.login({ email: filenEmail, password: filenPassword })
    _authenticatedFilenSDK = filen
    return filen
}

export const filenEmail = process.env.FILEN_CLI_TESTING_EMAIL!
export const filenPassword = process.env.FILEN_CLI_TESTING_PASSWORD!
