import { describe, it, expect } from "vitest"
import { Extra, FeatureContext, FeatureRegistry } from "./features"

describe("findFeature", () => {
    const registry = new FeatureRegistry({
        features: [
            {
                cmd: ["help", "h"],
                description: "help",
                arguments: [],
                invoke: async () => {}
            },
            {
                cmd: ["ls"],
                description: "ls",
                arguments: [
                    {
                        kind: "optional",
                        name: "path",
                        description: "path to list",
                    }
                ],
                invoke: async () => {}
            },
            {
                cmd: ["head"],
                description: "head",
                arguments: [
                    {
                        kind: "positional",
                        name: "file",
                        description: "file to read"
                    }
                ],
                invoke: async () => {}
            },
            {
                cmd: ["link", "link ls", "links", "links ls"],
                description: "link-list",
                arguments: [],
                invoke: async () => {}
            },
            {
                cmd: ["links", "link"],
                description: "link-edit",
                arguments: [
                    {
                        kind: "positional",
                        name: "path",
                        description: "path to link"
                    }
                ],
                invoke: async () => {}
            }
        ]
    })

    it("should find feature by full command", () => {
        const feature = registry.findFeature("help")
        expect(feature?.cmd).toBe("help")
    })

    it("should find feature without arguments / should not find shorter feature whose command is a prefix of another", () => {
        const feature = registry.findFeature("head")
        expect(feature?.cmd).toBe("head") // not "h"
    })

    it("shouldn't find feature by partial cmd", () => {
        const feature = registry.findFeature("hea")
        expect(feature?.cmd).toBeUndefined()
    })

    it("should differentiate based on arguments", () => {
        expect(registry.findFeature("link")?.feature.description).toBe("link-list")
        expect(registry.findFeature("link ls")?.feature.description).toBe("link-list")
        expect(registry.findFeature("link asdf")?.feature.description).toBe("link-edit")
    })
})

describe("autocomplete", () => {
    const registry = new FeatureRegistry({
        features: [
            {
                cmd: ["help", "h"],
                description: "Show help",
                arguments: [],
                invoke: async () => {}
            },
            {
                cmd: ["cd"],
                description: "Show help",
                arguments: [
                    {
                        kind: "positional",
                        name: "path",
                        description: "path to change directory to",
                        autocomplete: async (_, input) => input === "multi" ? ["multiple1", "multiple2"] : [input + "_complete"]
                    },
                    {
                        kind: "positional",
                        name: "target",
                        description: "another argument",
                        autocomplete: async (_, input) => [input + "_complete"]
                    }
                ],
                invoke: async () => {}
            },
            {
                cmd: ["async_cd"],
                description: "Show help",
                arguments: [
                    {
                        kind: "positional",
                        name: "path",
                        description: "path to change directory to",
                        autocomplete: (_, input) => new Promise(resolve => setTimeout(() => resolve([input + "_complete"]), 5))
                    }
                ],
                invoke: async () => {}
            },
            {
                cmd: ["link", "link list"],
                description: "List links",
                arguments: [],
                invoke: async () => {}
            },
            {
                cmd: ["link"],
                description: "Edit links",
                arguments: [
                    {
                        kind: "positional",
                        name: "path",
                        description: "path to link",
                        autocomplete: async (_, input) => [input + "_complete"]
                    }
                ],
                invoke: async () => {}
            }
        ]
    })
    const ctx = {} as FeatureContext<Extra>

    it("should return all commands when input is empty, appending spaces correctly", async () => {
        const result = await registry.autocomplete(ctx, "")
        expect(result).toEqual([["help", "h", "cd ", "async_cd ", "link"], ""])
    })

    it("should filter commands based on input", async () => {
        const result = await registry.autocomplete(ctx, "he")
        expect(result).toEqual([["help"], "he"])
    })

    it("should do nothing when command is already in full", async () => {
        const result = await registry.autocomplete(ctx, "help")
        expect(result).toEqual([["help"], "help"])
    })

    it("should return with space when command is in full but has arguments", async () => {
        const result = await registry.autocomplete(ctx, "cd")
        expect(result).toEqual([["cd "], "cd"])
    })

    it("should complete a positional argument", async () => {
        const result = await registry.autocomplete(ctx, "cd asdf")
        expect(result).toEqual([["asdf_complete"], "asdf"])
    })

    it("should complete a second positional argument", async () => {
        const result = await registry.autocomplete(ctx, "cd asdf qwer")
        expect(result).toEqual([["qwer_complete"], "qwer"])
    })

    it("should handle multiple completions", async () => {
        const result = await registry.autocomplete(ctx, "cd multi")
        expect(result).toEqual([["multiple1", "multiple2"], "multi"])
    })

    it("should complete a positional argument with longer async function", async () => {
        const result = await registry.autocomplete(ctx, "async_cd long")
        expect(result).toEqual([["long_complete"], "long"])
    })
})
