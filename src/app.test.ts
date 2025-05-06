import { describe, expect, test } from "vitest"
import { run } from "./test/tests"

describe("--help command", () => {

    test("general", async () => {
        const { output } = await run("--help")
        expect(output).toContain("View the topic pages")
    })

    test("specific topic", async () => {
        expect((await run("--help fs")).output).toContain("ls")
    })

    test("invalid topic", async () => {
        const { output, isError } = await run("--help asdfasdf")
        expect(isError).toBe(true)
        expect(output).toContain("Unknown help page asdfasdf")
    })

    // todo: more tests

})