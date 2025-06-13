import { beforeEach, describe, expect, test } from "vitest"
import { clearTestDir, getCredentials, testDataDir, mockApp, runMockApp } from "../test/tests"
import fs from "fs/promises"
import path from "path"
import { authenticate } from "./auth"
import { FeatureContext } from "../framework/features"
import { exists } from "./util/util"
import { X } from "./f"

describe("ways to authenticate", () => {

    const { email, password } = getCredentials()

    beforeEach(async () => {
        await clearTestDir()
    })

    const isAuthenticated = (ctx: FeatureContext<X>) => {
        return ctx.x.filen.config.email !== "anonymous" && ctx.x.filen.config.password !== "anonymous"
    }

    test("get credentials from arguments", async () => {
        const { ctx } = await mockApp({ unauthenticated: true })
        await authenticate(ctx, { email, password })
        expect(isAuthenticated(ctx)).toBe(true)
    })

    test("get credentials from environment variables", async () => {
        process.env.FILEN_EMAIL = email
        process.env.FILEN_PASSWORD = password
        const { ctx } = await mockApp({ unauthenticated: true })
        await authenticate(ctx, {})
        expect(isAuthenticated(ctx)).toBe(true)
        delete process.env.FILEN_EMAIL
        delete process.env.FILEN_PASSWORD
    })

    test("get credentials from .filen-cli-credentials", async () => {
        const file = `${email}\n${password}\n`
        await fs.writeFile(path.join(testDataDir, ".filen-cli-credentials"), file)
        const { ctx } = await mockApp({ unauthenticated: true })
        await authenticate(ctx, {})
        expect(isAuthenticated(ctx)).toBe(true)
        await fs.unlink(path.join(testDataDir, ".filen-cli-credentials"))
    })

    test("export and login from .filen-cli-auth-config", async () => {
        // export .filen-cli-auth-config
        await runMockApp({ cmd: "export-auth-config", input: ["i am aware of the risks", "1"] })
        expect(await exists(path.join(testDataDir, ".filen-cli-auth-config"))).toBe(true)
        
        // login from .filen-cli-auth-config
        const { ctx } = await mockApp({ unauthenticated: true })
        await authenticate(ctx, {})
        expect(isAuthenticated(ctx)).toBe(true)
    })

    test.todo("log in from .filen-cli-keep-me-logged-in file")

    test("get credentials from prompt", async () => {
        const { ctx, isInputEmpty } = await mockApp({ unauthenticated: true, input: [email, password, "N"] })
        await authenticate(ctx, {})
        expect(isAuthenticated(ctx)).toBe(true)
        expect(isInputEmpty()).toBe(true)
    })

    test("export api key", async () => {
        const { output } = await runMockApp({ cmd: "export-api-key", input: ["y"] })
        expect(output()).toContain("API Key for")
    })

})
