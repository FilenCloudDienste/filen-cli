import { formatTable } from "./util"
import { Extra, Feature, FeatureGroup, OptionArgument, PositionalArgument } from "./features"
import { App } from "./app"

export function printHelp<X extends Extra>(app: App<X>, selectedName: string, isInteractiveMode: boolean) {
	const selectedFeature = (() => {
		if (selectedName.length === 0) return app.features.featureGroup
		const featureGroup = app.features.getFeatureGroup(selectedName)
		if (featureGroup) return featureGroup
		return app.features.findFeature(selectedName)?.feature
	})()
	if (!selectedFeature) {
		app.outErr(`Unknown command or help topic: ${selectedName}`)
		return
	}

	const builder = new HelpTextBuilder()
	const printFeatureHelp = (feature: Feature<X> | FeatureGroup<X>) => {
		// recursively print FeatureGroup
		if (Object.hasOwn(feature, "features")) { // is FeatureGroup
			const featureGroup = feature as FeatureGroup<X>
			const isSelected = featureGroup.name !== undefined && featureGroup.name === (selectedFeature as FeatureGroup<X>).name
			if (!isSelected && featureGroup.visibility === "hide") return
			builder.appendNewline()
			if (!isSelected && featureGroup.visibility === "collapse") {
				builder.appendNewline()
				builder.appendText((() => {
						if (featureGroup.title) return featureGroup.title
						if (featureGroup.name) return featureGroup.name
						if (featureGroup.features.length > 0 && Object.prototype.hasOwnProperty.call(featureGroup.features[0], "cmd")) {
							return (featureGroup.features[0] as Feature<X>).cmd[0]!
						}
						return "***"
					})())
				const referenceName = featureGroup.name !== undefined ? featureGroup.name
					: featureGroup.features.length === 0 ? undefined
					: Object.prototype.hasOwnProperty.call(featureGroup.features[0], "cmd") ? (featureGroup.features[0] as Feature<X>).cmd[0]!
					: (featureGroup.features[0] as FeatureGroup<X>).name
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
			return
		}

		// print Feature command signature and description
		feature = feature as Feature<X>
		const isOptional = (arg: PositionalArgument<X> | OptionArgument<X>) => arg.kind === "option" && !(arg as OptionArgument<X>).isRequired
		builder.appendText("> " + [feature.cmd[0],...feature.arguments.map(arg => `${isOptional(arg) ? "[" : "<"}${arg.name}${arg.kind === "catch-all" ? "..." : ""}${isOptional(arg) ? "]" : ">"}`)].join(" "))
		builder.withIncreasedIndentation(() => {
			if (feature.description) {
				builder.appendText(feature.description!)
			}
			if (feature.longDescription) {
				builder.appendNewline()
				builder.appendText(feature.longDescription!)
				builder.appendNewline()
			}
			const formatArguments = feature.arguments.filter(arg => arg.description !== undefined).map(arg => ({ name: `${arg.name}${arg.kind === "catch-all" ? "..." : ""}`, description: arg.description, optional: isOptional(arg) }))
			if (formatArguments.length > 0) {
				builder.appendText(formatTable(formatArguments.map(arg => [`${arg.optional ? "[" : "<"}${arg.name}${arg.optional ? "]" : ">"}`, arg.description ?? ""])))
			}
		})
		
		builder.appendNewline()
	}
	if (!isInteractiveMode) {
		builder.appendText(app.info.name + " " + app.info.version)
	}
	printFeatureHelp(selectedFeature)
	builder.print(app)
}

class HelpTextBuilder<X extends Extra> {
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

	print(app: App<X>) {
		this.lines.forEach(line => {
			app.out(line.text, { indentation: line.indentation })
		})
	}
}