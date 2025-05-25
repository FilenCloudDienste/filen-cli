import dedent from "dedent"
import { version } from "../buildInfo"
import { formatTable } from "./util"
import { ArgumentType, Feature, FeatureGroup } from "../features"
import { App } from "../app"

export const versionCommand: Feature = {
	cmd: ["version", "v"],
	arguments: [],
	description: "Display the version of the Filen CLI.",
	skipAuthentication: true,
	invoke: async ({ app }) => {
		app.out(version)
	},
}

export function helpText({ title, name, text, visibility }: { title?: string, name: string | undefined, text: string, visibility?: "show" | "collapse" | "hide" }): FeatureGroup {
	return { title, description: text, name, features: [], visibility } satisfies FeatureGroup
}

export const generalHelpText = dedent`
	Usage: filen [options...] [cmd]

	Invoke the Filen CLI with no command specified to enter interactive mode. 
	
	Options:
	${formatTable([
		["--verbose, -v", "display additional information"],
		["--quiet, -q", "hide things like progress bars and additional logs"],
		["--log-file <file>", "write logs to a file"],
	])}
	`

export const helpCommand: Feature = {
	cmd: ["help", "h", "?"],
	arguments: [{ name: "section or command", type: ArgumentType.any, optional: true }],
	description: "Display usage information.",
	skipAuthentication: true,
	invoke: async ({ app, argv }) => {
		const selectedName = argv.map(arg => arg.toLowerCase()).join(" ")
		const selectedFeature = (() => {
			if (selectedName.length === 0) return app.features.featureGroup
			const featureGroup = app.features.getFeatureGroup(selectedName)
			if (featureGroup) return featureGroup
			return app.features.getFeature(selectedName)
		})()
		if (!selectedFeature) {
			app.outErr(`Unknown command or help topic: ${selectedName}`)
			return
		}

		const builder = new HelpTextBuilder()
		const printFeatureHelp = (feature: Feature | FeatureGroup) => {
			// recursively print FeatureGroup
			if (Object.hasOwn(feature, "features")) { // is FeatureGroup
				const featureGroup = feature as FeatureGroup
				const isSelected = featureGroup.name !== undefined && featureGroup.name === (selectedFeature as FeatureGroup).name
				if (!isSelected && featureGroup.visibility === "hide") return
				builder.appendNewline()
				if (!isSelected && featureGroup.visibility === "collapse") {
					builder.appendNewline()
					builder.appendText((() => {
							if (featureGroup.title) return featureGroup.title
							if (featureGroup.name) return featureGroup.name
							if (featureGroup.features.length > 0 && Object.prototype.hasOwnProperty.call(featureGroup.features[0], "cmd")) {
								return (featureGroup.features[0] as Feature).cmd[0]!
							}
							return "***"
						})())
					const referenceName = featureGroup.name !== undefined ? featureGroup.name
						: featureGroup.features.length === 0 ? undefined
						: Object.prototype.hasOwnProperty.call(featureGroup.features[0], "cmd") ? (featureGroup.features[0] as Feature).cmd[0]!
						: (featureGroup.features[0] as FeatureGroup).name
					if (referenceName) builder.appendText(` (expand via \`filen help ${referenceName}\`)`)
					builder.appendNewline()
					return
				}
				if (featureGroup.title) {
					builder.appendText(featureGroup.title)
				}
				if (featureGroup.description) {
					if (featureGroup.features.length === 0) builder.appendNewline()
					builder.appendText(featureGroup.description)
				}
				if (featureGroup.longDescription) {
					builder.withIncreasedIndentation(() => {
						builder.appendNewline()
						builder.appendText(featureGroup.longDescription!)
						builder.appendNewline()
					})
				}
				builder.appendNewline()
				if (featureGroup.features.length > 0) {
					builder.appendNewline()
					const printFeatures = () => featureGroup.features.forEach(feature => printFeatureHelp(feature))
					if (featureGroup.title) {
						builder.withIncreasedIndentation(() => printFeatures())
					} else {
						printFeatures()
					}
				}
				builder.appendNewline()
				return
			}

			// print Feature command signature and description
			feature = feature as Feature
			builder.appendText("> " + [feature.cmd[0],...feature.arguments.map(arg => `${arg.optional ? "[" : "<"}${arg.name}${arg.optional ? "]" : ">"}`)].join(" "))
			if (feature.description) {
				builder.withIncreasedIndentation(() => {
					builder.appendText(feature.description!)
				})
			}
			if (feature.longDescription) {
				builder.withIncreasedIndentation(() => {
					builder.appendNewline()
					builder.appendText(feature.longDescription!)
					builder.appendNewline()
				})
			}
		}
		builder.appendText("Filen CLI " + version) // todo: don't display this line if in interactive mode
		printFeatureHelp(selectedFeature)
		builder.print(app)
	}
}

class HelpTextBuilder {
	private lines: { text: string, indentation: number }[] = []
	private indentation = 0

	appendText(text: string) {
		this.lines.push({ text, indentation: this.indentation })
	}

	appendNewline() {
		if (this.lines[this.lines.length-1]?.text !== "") {
			this.lines.push({ text: "", indentation: this.indentation })
		}
	}

	withIncreasedIndentation(callback: () => void) {
		this.indentation++
		callback()
		this.indentation--
	}

	print(app: App) {
		this.lines.forEach(line => {
			app.out(line.text, { indentation: line.indentation })
		})
	}
}