import { describe, expect, it } from "bun:test"
import { printHelp } from "./helpPage"
import { mockFrameworkApp } from "../test/tests"

describe("help page", () => {

    const _app = () => mockFrameworkApp(f => [
        f.helpText({ name: "general", text: "This is general help." }),
        f.helpText({ name: "something", text: "This is something help." }),
        { features: [
            f.feature({
                cmd: ["my-feature"],
                description: "This is my feature.",
                longDescription: "This is a longer description of my feature.",
                args: {
                    myArg: f.arg({ name: "myArg", description: "This is my argument." }),
                    myOptionalArg: f.optionalArg({ name: "myOptionalArg", description: "This is my optional argument." }),
                    myDefaultValueArg: f.defaultValue("hello there", f.optionalArg({ name: "myDefaultValueArg", description: "This is my argument with a default value." })),
                    myCatchAllArg: f.catchAllArg({ name: "myCatchAllArg", description: "This is my catch-all argument." }),
                    myOptionArg: f.option({ name: "--myOptionArg", description: "This is my option argument." }),
                    myFlagArg: f.flag({ name: "--myFlagArg", alias: "-f", description: "This is my flag argument." }),
                    myRequiredOptionArg: f.required(f.option({ name: "--myRequiredOptionArg", description: "This is my required option argument." })),
                },
                invoke: async () => {},
            }),
        ], visibility: "collapse" },
        f.helpText({ title: "My Title", name: "my-title", text: "This is a collapsed help text description.", visibility: "collapse" }),
    ])
    
    it("should print general help", () => {
        const { app, output } = _app()
        printHelp(app, "", false)
        expect(output()).toMatchSnapshot()
    })

    it("should also print general help by specified name", () => {
        const { app, output } = _app()
        printHelp(app, "general", false)
        expect(output()).toMatchSnapshot()
    })

    it("should print any help by specified name", () => {
        const { app, output } = _app()
        printHelp(app, "something", false)
        expect(output()).toMatchSnapshot()
    })

    describe("collapsed sections", () => {
        it("should print in full when requested", () => {
            const { app, output } = _app()
            printHelp(app, "my-title", true)
            expect(output()).toMatchSnapshot()
        })
    })

    it("should print feature correctly", () => {
        const { app, output } = _app()
        printHelp(app, "my-feature", false)
        expect(output()).toMatchSnapshot()
    })

})