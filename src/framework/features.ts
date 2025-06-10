import vercelArg from "arg"
import { App } from "./app"
import * as pathModule from "node:path"
import * as fsModule from "node:fs/promises"

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
    arguments: (PositionalArgument | OptionArgument)[]
	invoke: (ctx: FeatureContextWithFeature<X>) => Promise<void | FeatureResult<X> | undefined>
} & Partial<X["Feature"]>

export type PositionalArgument = {
    kind: "positional" | "catch-all"
    name: string
    type: string
    description: string
    autocomplete?: (input: string) => string[],
}

export type OptionArgument = {
    kind: "option"
    name: string
    type: string
    alias?: string
    valueName?: string
    description: string
    isFlag?: boolean
    isRequired?: boolean
}

// feature

export type BuiltArgument<X extends Extra, T> = { spec: PositionalArgument | OptionArgument, value: (ctx: FeatureContextWithFeature<X>) => Promise<T> }

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

const arg = <X extends Extra>() => (spec: Omit<PositionalArgument, "kind" | "type">): BuiltArgument<X, string> => {
    return {
        spec: { kind: "positional", type: "any", ...spec },
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

const catchAll = <X extends Extra>() => (spec: Omit<PositionalArgument, "kind" | "type">): BuiltArgument<X, string[]> => {
    return {
        spec: { kind: "catch-all", type: "any", ...spec },
        value: async (ctx) => {
            const arg = parseArgs(ctx.feature, ctx.argv)
            return arg["_"].slice(ctx.feature.arguments.filter(arg => arg.kind === "positional").length)
        }
    }
}

const optionalArg = <X extends Extra>() => ((spec: Omit<PositionalArgument, "kind" | "type">): BuiltArgument<X, string | undefined> => {
    const arg = catchAll<X>()(spec)
    return { ...arg, value: async (ctx) => {
        const value = await arg.value(ctx)
        return value.length > 0 ? value[0] : undefined
    }}
})

const defaultValue = <X extends Extra>() => <T>(defaultValue: T, arg: BuiltArgument<X, T | undefined>): BuiltArgument<X, T> => {
    return {
        spec: { ...arg.spec, description: `${arg.spec.description} (default: ${defaultValue === "." ? "current directory" : defaultValue})` },
        value: async (ctx) => await arg.value(ctx) ?? defaultValue
    }
}

const option = <X extends Extra>() => (spec: Omit<OptionArgument, "kind" | "type" | "isFlag" | "isRequired">): BuiltArgument<X, string | undefined> => {
    return {
        spec: { kind: "option", type: "any", ...spec },
        value: async (ctx) => {
            const arg = parseArgs(ctx.feature, ctx.argv)
            return arg[spec.name]
        }
    }
}

const flag = <X extends Extra>() => (spec: Omit<OptionArgument, "kind" | "type" | "isFlag" | "isRequired">): BuiltArgument<X, boolean> => {
    return {
        spec: { kind: "option", type: "flag", ...spec, isFlag: true },
        value: async (ctx) => {
            const arg = parseArgs(ctx.feature, ctx.argv)
            return arg[spec.name] ?? false
        }
    }
}

const number = <X extends Extra>() => ((arg: BuiltArgument<X, string | undefined>, type?: "int" | "float"): BuiltArgument<X, number | undefined> => {
    return {
        spec: { ...arg.spec, type: type ?? "int" },
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

const localPath = <X extends Extra>() => ({ restrictType, skipCheckExists }: { restrictType?: "file" | "directory", skipCheckExists?: boolean }, arg: BuiltArgument<X, string | undefined>): BuiltArgument<X, string> => {
    return {
        spec: { ...arg.spec, type: "localPath" },
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
                RegExp(`^${cmd === "?" ? "\\?" : cmd}${feature.arguments.filter(arg => arg.kind === "positional").map(() => " \\w+").join("")}`)
            })))
            .sort((a, b) => (b.cmd.length - a.cmd.length)*100 + (b.feature.arguments.length - a.feature.arguments.length)*1) // sort by decreasing length of cmd (meaning specificity of the cmd), then by number or args
        const found = signatures.find(({ signature }) => signature.test(input))
        return found ? {
            cmd: found.cmd,
            feature: found.feature,
        } : undefined
    }
}