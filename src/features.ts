// todo: document this architecture

import FilenSDK from "@filen/sdk"
import { App, cliArgsSpec } from "./app"
import { CloudPath } from "./util/cloudPath"
import arg from "arg"

export class FeatureRegistry {
    public featureGroup: FeatureGroup
    public features: Feature[]

    constructor(features: FeatureGroup) {
        this.featureGroup = features

        // flatten features
        const addFeatures = (featureGroup: Feature | FeatureGroup) => {
            if (Object.hasOwn(featureGroup, "features")) { // is FeatureGroup
                (featureGroup as FeatureGroup).features.forEach(addFeatures)
            } else {
                this.features.push(featureGroup as Feature)
            }
        }
        this.features = []
        addFeatures(features)
    }

    public getFeatureGroup(name: string): FeatureGroup | undefined {
        return this._getFeatureGroup(name, this.featureGroup)
    }
    private _getFeatureGroup(name: string, featureGroup: FeatureGroup): FeatureGroup | undefined {
        for (const feature of featureGroup.features) {
            if (Object.hasOwn(feature, "features")) { // is FeatureGroup
                if ((feature as FeatureGroup).name === name) {
                    return feature as FeatureGroup
                } else {
                    const found = this._getFeatureGroup(name, feature as FeatureGroup)
                    if (found) {
                        return found
                    }
                }
            }
        }
        return undefined
    }

    public getFeature(cmd: string): Feature | undefined {
        return this.features.find(feature => feature.cmd.includes(cmd))
    }
}

export type FeatureContext = {
	app: App
	filen: FilenSDK
	cloudWorkingPath: CloudPath
	
	cmd?: string
    feature?: Feature
	argv: string[]
	cliArgs: ReturnType<typeof arg<typeof cliArgsSpec>>
	verbose: boolean
	quiet: boolean
	formatJson: boolean
}

export type FeatureResult = {
	cloudWorkingPath?: CloudPath
	exit?: boolean
}

export type Feature = {
	cmd: string[]
	description?: string
    longDescription?: string
	arguments: Argument[]
    flagsDoc?: { name: string, description: string, required?: boolean }[]
    skipAuthentication?: boolean
	invoke: (ctx: Omit<FeatureContext, "feature"> & Required<Pick<FeatureContext, "feature">>) => Promise<void | FeatureResult | undefined>
}

export type FeatureGroup = {
	title?: string
    name?: string
	description?: string
    longDescription?: string
    visibility?: "show" | "collapse" | "hide"
	features: (Feature | FeatureGroup)[]
}

export type FlagSpec = {
    name: string
    type: FlagType
    valueName?: string
    description: string | null
    alias?: string
    required?: boolean
}

export enum FlagType {
    boolean,
    string,
}
type FlagTypeResult<T extends FlagType> =
    T extends FlagType.boolean ? boolean :
    string

export type Argument = {
    name: string
} & ArgumentSpec

export type ArgumentSpec = {
    type: ArgumentType
    description: string | null
    optional?: boolean
}

export enum ArgumentType {
    cloudDirectory,
    cloudFile,
    cloudPath,
    localFile,
    localPath,
    any,
    catchAll,
}
type ArgumentTypeResult<T extends ArgumentType> =
    T extends ArgumentType.cloudDirectory ? CloudPath :
    T extends ArgumentType.cloudFile ? CloudPath :
    T extends ArgumentType.cloudPath ? CloudPath :
    T extends ArgumentType.catchAll ? string[] :
    string

export function argumentTypeIsFileSystem(argumentType: ArgumentType): boolean {
    return argumentType !== ArgumentType.any
}

export function argumentTypeIsCloud(argumentType: ArgumentType): boolean {
    return argumentType === ArgumentType.cloudDirectory || argumentType === ArgumentType.cloudFile || argumentType === ArgumentType.cloudPath
}

export function argumentTypeAcceptsFile(argumentType: ArgumentType): boolean {
    return argumentType === ArgumentType.localFile || argumentType === ArgumentType.localPath || argumentType === ArgumentType.cloudFile || argumentType === ArgumentType.cloudPath
}

export const testFeature = feature({
	cmd: ["test"],
	description: "A test feature.",
	flags: {
		someFlagA: { name: "--flag-a", type: FlagType.boolean, description: null },
		optionalB: { name: "--flag-b", type: FlagType.boolean, alias: "-b", description: null },
		stringC: { name: "--flag-c", type: FlagType.string, description: null },
	},
	args: {
		localFile: { type: ArgumentType.localFile, description: null },
		cloudFile: { type: ArgumentType.cloudFile, /* optional: true, */ description: null },
		rest: { type: ArgumentType.catchAll, description: null },
	},
	invoke: async ({ app, flags, args }) => {
		if (flags.someFlagA) app.out("flag a")
		if (flags.optionalB) app.out("flag b")
		app.out("flag c: " + flags.stringC)
		app.out("local file: " + args.localFile)
		app.out("cloud file: " + args.cloudFile)
		app.out("rest: " + args.rest.join(", "))
	}
})

// todo: value field for a flag with FlagType.string
// todo: generate documentation for flags
// todo: add default value for flags, for args
// todo: add FlagType.number, ArgumentType.number with checking and parsing
// todo: automatically parse ArgumentType.cloudPath to CloudPath (based on cloudWorkingPath)
// todo: show catch-all arguments in help

type FeatureContextWithFeature = Omit<FeatureContext, "feature"> & Required<Pick<FeatureContext, "feature">>
type FlagsSpec = Record<string, FlagSpec>
export type ParsedFlags<T extends FlagsSpec> = { [K in keyof T]: T[K]["type"] extends FlagType.boolean ? boolean : T[K]["required"] extends true ? FlagTypeResult<T[K]["type"]> : FlagTypeResult<T[K]["type"]> | undefined }
type ArgsSpec = Record<string, ArgumentSpec>
export type ParsedArgs<T extends ArgsSpec> = { [K in keyof T]: T[K]["optional"] extends true ? ArgumentTypeResult<T[K]["type"]> | undefined : ArgumentTypeResult<T[K]["type"]> }
export function feature<flags extends FlagsSpec, args extends ArgsSpec>(feature: Omit<Feature, "invoke" | "arguments" | "flags"> & {
    flags?: flags,
    args?: args,
    invoke: (ctx: FeatureContextWithFeature & { flags: ParsedFlags<flags> } & { args: ParsedArgs<args> }) => Promise<void | FeatureResult | undefined>,
}): Feature {
    try {
        if (feature.cmd.length === 0) {
            throw Error("Feature needs at least one cmd")
        }

        // check the format of flags name and alias
        for (const flag of Object.values(feature.flags ?? {})) {
            if (!flag.name.startsWith("-")) {
                throw Error(`Flag name "${flag.name}" must start with "-" or "--"`)
            } else {
                if (!flag.name.startsWith("--")) {
                    if (flag.name.length > 2) {
                        throw Error(`Flag name "${flag.name}" must be a single character (e.g. "-a")`)
                    }
                }
            }
            if (flag.alias && flag.alias.length > 2) {
                throw Error(`Flag alias "${flag.alias}" must be a single character (e.g. "-a")`)
            }
            /* if (flag.type !== FlagType.boolean) {
                if (flag.alias) {
                    throw Error(`Short flag alias "${flag.alias}" is invalid for a non-boolean flag`)
                }
                if (!flag.name.startsWith("--")) {
                    throw Error(`Short flag name "${flag.name}" is invalid for a non-boolean flag`)
                }
            } */ // todo: this is probably not necessary
        }

        // check the format of positional arguments
        let isOptional = false
        let isCatchAll = false
        for (const arg of Object.values(feature.args ?? {})) {
            if (arg.type === ArgumentType.catchAll) {
                if (isOptional) {
                    throw Error("Cannnot declare both catch-all and optional arguments")
                }
                isCatchAll = true
            } else if (isCatchAll) {
                throw Error("Cannot specify any arguments after a catch-all argument")
            }
            if (arg.optional) {
                isOptional = true
            } else if (isOptional) {
                throw Error("Positional arguments must be defined before optional arguments")
            }
        }
    } catch (e) {
        throw Error(`Error constructing feature "${feature.cmd}": ${e instanceof Error ? e.message : e}`)
    }

    return {
        ...feature,
        arguments: Object.entries(feature.args ?? {}).map(([name, spec]) => ({ name, ...spec })),
        flagsDoc: Object.values(feature.flags ?? {}).map(flag => {
            const argumentNameStr = flag.type === FlagType.string ? ` <${flag.valueName ?? ".."}>` : ""
            return { name: flag.name + argumentNameStr + (flag.alias ? `, ${flag.alias}` + argumentNameStr : ""), description: flag.description ?? "", required: flag.required }
        }),
        invoke: async (ctx) => {
            // parse flags
            const spec = Object.fromEntries(Object.values(feature.flags ?? {}).map(flag => ([
                [flag.name, flag.type === FlagType.string ? String : Boolean],
                ...(flag.alias ? [[flag.alias, flag.name]] : []),
            ])).flat())
            const parsedFlagsRaw = arg(spec, { permissive: true, argv: ctx.argv })
            const missingFlags = Object.values(feature.flags ?? {})
                .filter(flag => flag.required && parsedFlagsRaw[flag.name] === undefined)
                .map(flag => flag.name)
            if (missingFlags.length > 0) {
                ctx.app.errExit(`Need to specify required flags: ${missingFlags.join(", ")}`)
            }
            const argv = parsedFlagsRaw["_"]
            const parsedFlags = Object.fromEntries(Object.entries(feature.flags ?? {}).map(([name, spec]) => {
                const value = parsedFlagsRaw[spec.name]
                switch (spec.type) {
                    case FlagType.boolean: return [name, (value ?? false) satisfies boolean]
                    case FlagType.string: return [name, value satisfies string | undefined]
                    default: throw new Error(`Unhandled flag type: ${spec.type}`)
                }
            })) as ParsedFlags<flags>

            // parse positional arguments
            const parsedArgsRaw: Record<string, string | CloudPath | undefined | string[]> = {}
            for (const [name, spec] of Object.entries(feature.args ?? {})) {
                const index = Object.keys(feature.args ?? {}).indexOf(name)
                if (spec.type === ArgumentType.catchAll) {
                    parsedArgsRaw[name] = argv.slice(index)
                } else {
                    const input = argv[index]
                    if (input !== undefined || spec.optional) {
                        parsedArgsRaw[name] = (() => {
                            if (input === undefined) return undefined
                            switch (spec.type) {
                                case ArgumentType.cloudDirectory: return ctx.cloudWorkingPath.navigate(input)
                                case ArgumentType.cloudFile: return ctx.cloudWorkingPath.navigate(input)
                                case ArgumentType.cloudPath: return ctx.cloudWorkingPath.navigate(input)
                                case ArgumentType.localFile: return input
                                case ArgumentType.localPath: return input
                                case ArgumentType.any: return input
                            }
                        })()
                    } else {
                        ctx.app.errExit(`Need to specify all arguments: ${ctx.feature.arguments.map(arg => arg.name + (arg.optional ? " (optional)" : "")).join(", ")}`)
                    }
                }
            }
            const parsedArgs = parsedArgsRaw as ParsedArgs<args>

            return await feature.invoke({ ...ctx, flags: parsedFlags, args: parsedArgs })
        }
    }
}

/**
 * Splits a command input into segments, while respecting quotes.
 * Example: `'cd "folder name"'` returns `['cd', '"folder name"']`.
 */
export function splitCommandSegments(input: string): string[] {
	const segments: string[] = []
	let buffer = ""
	let insideQuotes = false
	input.split("").forEach(c => {
		if (c === "\"") insideQuotes = !insideQuotes
		if (c === " " && !insideQuotes) {
			segments.push(buffer)
			buffer = ""
		} else {
			buffer += c
		}
	})
	if (buffer.length > 0) segments.push(buffer)
	return segments
}
