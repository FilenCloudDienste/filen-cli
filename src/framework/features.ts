import vercelArg from "arg"
import { App, splitCommandSegments } from "./app"
import * as pathModule from "node:path"
import * as fsModule from "node:fs/promises"
import { exists } from "../app/util/util"

export type Extra = {
    FeatureContext: object
    Feature: object
}
export type EmptyX = {
    FeatureContext: object
    Feature: object
}

export type FeatureContext<X extends Extra> = {
    app: App<X>
    cmd?: string
    feature?: Feature<X>
    argv: string[]
    verbose: boolean
    quiet: boolean
    formatJson: boolean
    isInteractiveMode: boolean
    x: X["FeatureContext"]
}
export type FeatureContextWithFeature<X extends Extra> = Omit<FeatureContext<X>, "feature"> & Required<Pick<FeatureContext<X>, "feature">>

export type FeatureResult<X extends Extra> = {
	exit?: boolean
    ctx?: Partial<FeatureContext<X>>
}

export type Feature<X extends Extra> = {
	cmd: string[]
	description: string | null
    longDescription?: string
    arguments: (PositionalArgument<X> | OptionArgument<X>)[]
	invoke: (ctx: FeatureContextWithFeature<X>) => Promise<void | FeatureResult<X> | undefined>
} & Partial<X["Feature"]>

export type PositionalArgument<X extends Extra> = Argument<X> & {
    kind: "positional" | "catch-all"
}

export type OptionArgument<X extends Extra> = Argument<X> & {
    kind: "option"
    alias?: string
    valueName?: string
    isFlag?: boolean
    isRequired?: boolean
}

type Autocompleter<X extends Extra> = (ctx: FeatureContext<X>, input: string) => Promise<string[]>
type Argument<X extends Extra> = {
    name: string
    description: string
    autocomplete?: Autocompleter<X>
}

// feature

export type BuiltArgument<X extends Extra, T> = { spec: PositionalArgument<X> | OptionArgument<X>, value: (ctx: FeatureContextWithFeature<X>) => Promise<T> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ParsedArgs<X extends Extra, args extends Record<string, BuiltArgument<X, any>>> = { [K in keyof args]: Awaited<ReturnType<args[K]["value"]>> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const feature = <X extends Extra>() => <args extends Record<string, BuiltArgument<X, any>>> (feature: Omit<Feature<X>, "invoke" | "arguments"> & {
    args?: args,
    invoke: (ctx: FeatureContextWithFeature<X> & { args: ParsedArgs<X, args> } & X["FeatureContext"]) => Promise<void | FeatureResult<X> | undefined>,
}): Feature<X> => {
    const argumentsSpec = Object.values((feature.args ?? {})).map(spec => spec.spec)

    try {
        if (feature.cmd.length === 0) {
            throw Error("Feature needs at least one cmd")
        }

        if (argumentsSpec.filter(arg => arg.kind === "catch-all").length > 1) {
            throw Error(`Feature "${feature.cmd[0]}" has more than one catch-all argument`)
        }

        // todo: other checks?
    } catch (e) {
        throw Error(`Error constructing feature "${feature.cmd}": ${e instanceof Error ? e.message : e}`)
    }

    return {
        ...feature,
        arguments: argumentsSpec,
        invoke: async (ctx) => {
            const argEntries = Object.entries((feature.args ?? {})).map(([name, spec]) => (async () => [name, await spec.value(ctx)])())
            const args = Object.fromEntries(await Promise.all(argEntries))
            return await feature.invoke({ ...ctx, args, ...ctx.x })
        }
    }
}

// builtin argument builders

export function parseArgs<X extends Extra>(feature: Feature<X>, argv: string[]) {
    const spec = Object.fromEntries(feature.arguments.flatMap(arg => {
        if (arg.kind === "option") {
            return [
                [arg.name, (arg.isFlag ? Boolean : String)],
                ...(arg.alias ? [[arg.alias, arg.name]] : [])
            ]
        } else {
            return []
        }
    }))
    return vercelArg(spec, { permissive: true, argv: argv })
}

const arg = <X extends Extra>() => (spec: Omit<PositionalArgument<X>, "kind" | "type">): BuiltArgument<X, string> => {
    return {
        spec: { kind: "positional", ...spec },
        value: async (ctx) => {
            const index = ctx.feature.arguments.filter(arg => arg.kind === "positional").findIndex(arg => arg.name === spec.name)
            const arg = parseArgs(ctx.feature, ctx.argv)
            if (arg["_"].length < index + 1) {
                ctx.app.errExit(`Positional argument "${spec.name}" not found. Expected at least ${index + 1} positional arguments, but got ${arg["_"].length}.`)
            }
            return arg["_"][index]!
        }
    }
}

const catchAll = <X extends Extra>() => (spec: Omit<PositionalArgument<X>, "kind" | "type">): BuiltArgument<X, string[]> => {
    return {
        spec: { kind: "catch-all", ...spec },
        value: async (ctx) => {
            const arg = parseArgs(ctx.feature, ctx.argv)
            return arg["_"].slice(ctx.feature.arguments.filter(arg => arg.kind === "positional").length)
        }
    }
}

const optionalArg = <X extends Extra>() => ((spec: Omit<PositionalArgument<X>, "kind" | "type">): BuiltArgument<X, string | undefined> => {
    const arg = catchAll<X>()(spec)
    return { ...arg, value: async (ctx) => {
        const value = await arg.value(ctx)
        return value.length > 0 ? value[0] : undefined
    }}
})
// todo: fix optional args being printed like "ls <directory...>" with required "<>" and "..."

const defaultValue = <X extends Extra>() => <T>(defaultValue: T, arg: BuiltArgument<X, T | undefined>): BuiltArgument<X, T> => {
    return {
        spec: { ...arg.spec, description: `${arg.spec.description} (default: ${defaultValue === "." ? "current directory" : defaultValue})` },
        value: async (ctx) => await arg.value(ctx) ?? defaultValue
    }
}

const option = <X extends Extra>() => (spec: Omit<OptionArgument<X>, "kind" | "type" | "isFlag" | "isRequired">): BuiltArgument<X, string | undefined> => {
    return {
        spec: { kind: "option", ...spec },
        value: async (ctx) => {
            const arg = parseArgs(ctx.feature, ctx.argv)
            return arg[spec.name]
        }
    }
}

const flag = <X extends Extra>() => (spec: Omit<OptionArgument<X>, "kind" | "type" | "isFlag" | "isRequired">): BuiltArgument<X, boolean> => {
    return {
        spec: { kind: "option", ...spec, isFlag: true },
        value: async (ctx) => {
            const arg = parseArgs(ctx.feature, ctx.argv)
            return arg[spec.name] ?? false
        }
    }
}

const number = <X extends Extra>() => ((arg: BuiltArgument<X, string | undefined>, type?: "int" | "float"): BuiltArgument<X, number | undefined> => {
    return {
        spec: { ...arg.spec },
        value: async (ctx) => {
            const value = await arg.value(ctx)
            const number = value ? (type === "float" ? parseFloat(value) : parseInt(value)) : undefined
            if (number !== undefined && isNaN(number)) {
                ctx.app.errExit(`Expected a number for ${arg.spec.kind} argument "${arg.spec.name}", but got "${value}".`)
            }
            return number
        }
    }
}) as {
    (arg: BuiltArgument<X, string>, type?: "int" | "float"): BuiltArgument<X, number>
    (arg: BuiltArgument<X, string | undefined>, type?: "int" | "float"): BuiltArgument<X, number | undefined>
}

export const fileSystemAutocompleter = <X extends Extra>({ restrictToDirectories, exists, readdir, isDirectory }: {
    restrictToDirectories: boolean,
    exists: (ctx: FeatureContext<X>, path: string) => Promise<boolean>,
    readdir: (ctx: FeatureContext<X>, path: string) => Promise<{ name: string, isDirectory: boolean }[]>,
    isDirectory: (ctx: FeatureContext<X>, path: string) => Promise<boolean>
}): Autocompleter<X> => async (ctx, input) => {
    // if the path doesn't exist, or ends in "/", check the parent instead for items beginning with string
    if (!(await exists(ctx, input)) || input.endsWith("/")) {
        const { parent, filename } = input.endsWith("/")
            ? { parent: input, filename: "" }
            : { parent: pathModule.dirname(input), filename: pathModule.basename(input) }
        const parentItems = await readdir(ctx, parent)
        return parentItems
            .filter(item => item.name.startsWith(filename))
            .filter(item => !restrictToDirectories || item.isDirectory)
            .map(item => input.substring(0, input.length - filename.length) + item.name)
    }
    
    // if the path exists, append "/" if it's a directory
    if (await isDirectory(ctx, input) && !input.endsWith("/")) {
        return [input + "/"]
    } else {
        return [input]
    }
}

const localPath = <X extends Extra>() => ({ restrictType, skipCheckExists }: { restrictType?: "file" | "directory", skipCheckExists?: boolean }, arg: BuiltArgument<X, string | undefined>): BuiltArgument<X, string> => {
    return {
        spec: {
            ...arg.spec,
            autocomplete: fileSystemAutocompleter({
                restrictToDirectories: restrictType === "directory",
                exists: (_, path) => exists(path),
                readdir: async (_, path) => (await fsModule.readdir(path, { withFileTypes: true })).map(dirent => ({ name: dirent.name, isDirectory: dirent.isDirectory() })),
                isDirectory: async (_, path) => (await fsModule.stat(path)).isDirectory()
            }),
        },
        value: async (ctx) => {
            const path = pathModule.resolve(await arg.value(ctx) ?? "")
            if (!skipCheckExists) {
                const stat = await (async () => {
                    try {
                        return await fsModule.stat(path)
                    } catch {
                        return ctx.app.errExit(`No such local ${restrictType ?? "path"}: ${path}`)
                    }
                })()
                if ((restrictType === "file" && !stat.isFile) || (restrictType === "directory" && !stat.isDirectory())) {
                    ctx.app.errExit(`Not a ${restrictType}: ${path}`)
                }
            }
            return path
        }
    }
}

const required = <X extends Extra>() => <T>(arg: BuiltArgument<X, T | undefined>): BuiltArgument<X, T> => {
    return {
        spec: arg.spec.kind === "option" ? { ...arg.spec, isRequired: true } : arg.spec,
        value: async (ctx) => {
            const value = await arg.value(ctx)
            if (value === undefined) {
                return ctx.app.errExit(`Required argument ${arg.spec.name} is missing.`)
            }
            return value
        }
    }
}

const argumentBuilder = <X extends Extra>() => <In, Out, args extends Record<string, unknown>>(fn: (args: args) => { spec: (arg: BuiltArgument<X, In>) => BuiltArgument<X, Out>["spec"], value: (arg: BuiltArgument<X, In>, ctx: FeatureContextWithFeature<X>) => Promise<ReturnType<BuiltArgument<X, Out>["value"]>> }) => {
    return (args: args, arg: BuiltArgument<X, In>) => {
        const { spec, value } = fn(args)
        return {
            spec: spec(arg),
            value: async (ctx) => await value(arg, ctx)
        } satisfies BuiltArgument<X, Out> as BuiltArgument<X, Out>
    }
}

const helpText = <X extends Extra>() => ({ title, name, text, visibility }: { title?: string, name: string | undefined, text: string, visibility?: "show" | "collapse" | "hide" }) => {
    return { title, description: text, name, features: [], visibility } satisfies FeatureGroup<X>
}

// export "f"

export const buildF = <X extends Extra>() => ({
    app: (...args: ConstructorParameters<typeof App<X>>) => new App(...args),
    feature: feature<X>(),
    arg: arg<X>(),
    catchAll: catchAll<X>(),
    optionalArg: optionalArg<X>(),
    defaultValue: defaultValue<X>(),
    option: option<X>(),
    flag: flag<X>(),
    number: number<X>(),
    localPath: localPath<X>(),
    required: required<X>(),
    argumentBuilder: argumentBuilder<X>(),
    helpText: helpText<X>(),
})

// feature groups

export type FeatureGroup<X extends Extra> = {
    title?: string
    name?: string
    description?: string
    longDescription?: string
    visibility?: "show" | "collapse" | "hide"
    features: (Feature<X> | FeatureGroup<X>)[]
}

export class FeatureRegistry<X extends Extra> {
    public featureGroup: FeatureGroup<X>
    public features: Feature<X>[]

    constructor(features: FeatureGroup<X>) {
        this.featureGroup = features

        // flatten features
        const addFeatures = (featureGroup: Feature<X> | FeatureGroup<X>) => {
            if (Object.hasOwn(featureGroup, "features")) { // is FeatureGroup
                (featureGroup as FeatureGroup<X>).features.forEach(addFeatures)
            } else {
                this.features.push(featureGroup as Feature<X>)
            }
        }
        this.features = []
        addFeatures(features)
    }

    public getFeatureGroup(name: string): FeatureGroup<X> | undefined {
        return this._getFeatureGroup(name, this.featureGroup)
    }
    private _getFeatureGroup(name: string, featureGroup: FeatureGroup<X>): FeatureGroup<X> | undefined {
        for (const feature of featureGroup.features) {
            if (Object.hasOwn(feature, "features")) { // is FeatureGroup
                if ((feature as FeatureGroup<X>).name === name) {
                    return feature as FeatureGroup<X>
                } else {
                    const found = this._getFeatureGroup(name, feature as FeatureGroup<X>)
                    if (found) {
                        return found
                    }
                }
            }
        }
        return undefined
    }

    public findFeature(input: string): { cmd: string, feature: Feature<X> } | undefined {
        const signatures = this.features
            .flatMap(feature => feature.cmd.map(cmd => ({ feature, cmd, signature: 
                RegExp(`^${cmd === "?" ? "\\?" : cmd}${feature.arguments.filter(arg => arg.kind === "positional").map(() => " [^\\s]+").join("")}`) // missing "$" allows for more characters at the end
                // todo: differentiate between "catch-all" and single "optional" positional arguments? -> allows for autocompleting them
            })))
            .sort((a, b) => (b.cmd.length - a.cmd.length)*100 + (b.feature.arguments.length - a.feature.arguments.length)*1) // sort by decreasing length of cmd (meaning specificity of the cmd), then by number or args
        const found = signatures.find(({ signature }) => signature.test(input))
        if (found) {
            return { cmd: found.cmd, feature: found.feature }
        }

        // if no feature matches exactly, find the one with the longest cmd that matches the input
        return this.features.flatMap(feature => feature.cmd.map(cmd => ({ feature, cmd })))
            .sort((a, b) => b.cmd.length - a.cmd.length) // sort by decreasing length of cmd
            .find(({ cmd }) => input.startsWith(cmd))
    }

    public async autocomplete(ctx: FeatureContext<X>, input: string): Promise<[string[], string]> {
        // from every feature, get the list of space-separated strings that make up the cmd/argv
        const features = this.features.flatMap(feature => feature.cmd.map(cmd => ({
            feature,
            segments: [
                ...cmd.split(" ").map(c => ({ type: "constant", value: c })),
                ...feature.arguments.filter(arg => arg.kind === "positional").map(arg => ({ type: "word", autocomplete: arg.autocomplete })),
                ...feature.arguments.filter(arg => arg.kind === "catch-all").map(arg => ({ type: "catch-all", autocomplete: arg.autocomplete })),
            ]
        }))) as { feature: Feature<X>, segments: ({ type: "constant", value: string } | { type: "word" | "catch-all", autocomplete?: Autocompleter<X> })[] }[]

        // filter which features would fit what's already written
        const inputSegments = splitCommandSegments(input)
        const matchingFeatures = features.filter(({ segments }) => {
            return inputSegments.length === 0 || inputSegments.every((inputSegment, i) => {
                if (i >= segments.length) return true // additional input segments are allowed, since we're not checking option arguments
                const segment = segments[i]!
                if (segment.type === "constant") {
                    // exact match
                    if (inputSegment === segment.value) return true
                    // constants may match only start, if they are the one being typed
                    if (i === inputSegments.length - 1 && segment.value.startsWith(inputSegment)) return true
                    return false
                }
                return true // word segments always match
            })
        })
        // todo: does this need to take option arguments into account?

        // the segment currently being typed is the last one
        // but if the input ends in a space, it's the next segment
        const currentSegmentIndex = inputSegments.length === 0 ? 0 : input.endsWith(" ") ? inputSegments.length : inputSegments.length - 1
        const currentSegmentInput = inputSegments[currentSegmentIndex] ?? ""

        // for every matching feature, get the completions
        const completionsPromises: Promise<string[]>[] = matchingFeatures.map(async ({ segments }) => {
            // if the currentSegmentIndex is out of bounds and the last segment is a catch-all segment, it is the current segment
            const currentSegment = segments[currentSegmentIndex] ?? (segments[segments.length - 1]?.type === "catch-all" ? segments[segments.length - 1] : undefined)
            if (!currentSegment) return [] // no more segment

            // apppend a space if there are more segments after the current one
            const optionalSpace = currentSegmentIndex < segments.length - 1 ? " " : ""

            // if the current segment is a constant
            if (currentSegment.type === "constant") {
                return [currentSegment.value + optionalSpace]
            }

            // if the current segment is a word, get the autocomplete results
            return await currentSegment.autocomplete?.call(this, ctx, currentSegmentInput) ?? []
        })
        const allCompletions = (await Promise.all(completionsPromises)).flat()
        
        // deduplicate completions
        // if "link " and "link" exist, keep only "link"; keep "cd ", where there isn't "cd"
        const completions: string[] = []
        for (const completion of [...allCompletions].sort((a, b) => a.length - b.length)) {
            const trimmedCompletion = completion.trimEnd()
            if (!(completion.endsWith(" ") && allCompletions.includes(trimmedCompletion))) {
                completions.push(completion)
            }
        }
        // bring back in correct order
        completions.sort((a, b) => allCompletions.indexOf(a) - allCompletions.indexOf(b))

        return [completions, currentSegmentInput]
    }
}