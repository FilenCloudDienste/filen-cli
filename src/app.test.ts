import { describe, expect, it } from "vitest"
import { runMockApp } from "./test/tests"

describe("--help command", () => {

    it("general", async () => {
        const { output } = await runMockApp({ cmd: "--help" })
        expect(output()).toContain("View the topic pages")
    })

    it("specific topic", async () => {
        expect((await runMockApp({ cmd: "--help fs" })).output()).toContain("ls")
    })

    it("invalid topic", async () => {
        const { output, isError } = await runMockApp({ cmd: "--help asdfasdf" })
        expect(isError).toBe(true)
        expect(output()).toContain("Unknown help page asdfasdf")
    })

    // todo: more tests

})