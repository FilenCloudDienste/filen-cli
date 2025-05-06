import { beforeEach, describe, expect, test } from "vitest"
import { authenticatedFilenSDK, clearTestDir, getCredentials, MockApp, testDataDir, unauthenticatedFilenSDK } from "./test/tests"
import { Authentication } from "./auth"
import FilenSDK from "@filen/sdk"
import fs from "fs/promises"
import path from "path"
import { exists } from "./util/util"

describe.skip("ways to authenticate", () => {

    const { email, password } = getCredentials()

    let app: MockApp
    let filen: FilenSDK
    let authentication: Authentication

    const isAuthenticated = () => {
        return filen.config.email !== "anonymous" && filen.config.password !== "anonymous"
    }

    beforeEach(async () => {
        await clearTestDir()
        app = new MockApp()
        filen = unauthenticatedFilenSDK()
        authentication = new Authentication(app, filen)
    })

    test("get credentials from arguments", async () => {
        await authentication.authenticate(email, password, undefined, false, false)
        expect(isAuthenticated()).toBe(true)
    })

    test("get credentials from environment variables", async () => {
        process.env.FILEN_EMAIL = email
        process.env.FILEN_PASSWORD = password
        await authentication.authenticate(undefined, undefined, undefined, false, false)
        expect(isAuthenticated()).toBe(true)
    })

    test("get credentials from .filen-cli-credentials", async () => {
        const file = `${email}\n${password}\n`
        await fs.writeFile(path.join(testDataDir, ".filen-cli-credentials"), file)
        await authentication.authenticate(undefined, undefined, undefined, false, false)
        expect(isAuthenticated()).toBe(true)
        await fs.unlink(path.join(testDataDir, ".filen-cli-credentials"))
    })

    test("export and login from .filen-cli-auth-config", async () => {
        // export .filen-cli-auth-config
        const authentication1 = new Authentication(app, await authenticatedFilenSDK())
        app.input(["i am aware of the risks", "1"])
        await authentication1.authenticate(undefined, undefined, undefined, true, false)
        expect(await exists(path.join(testDataDir, ".filen-cli-auth-config"))).toBe(true)
        
        // login from .filen-cli-auth-config
        expect(await exists(path.join(testDataDir, ".filen-cli-auth-config"))).toBe(true)
        await authentication.authenticate(undefined, undefined, undefined, false, false)
        expect(isAuthenticated()).toBe(true)
    })

    test.todo("login from .filen-cli-keep-me-logged-in")

    test("get credentials from prompt", async () => {
        app.input([email, password, "N"])
        await authentication.authenticate(undefined, undefined, undefined, false, false)
        expect(isAuthenticated()).toBe(true)
        expect(app.isInputEmpty()).toBe(true)
    })

    test("export api key", async () => {
        app.input("y")  
        await authentication.authenticate(email, password, undefined, false, true)
        expect(app.output()).toContain("API Key for")
    })

})
