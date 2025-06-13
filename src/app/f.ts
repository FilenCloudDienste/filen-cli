import FilenSDK from "@filen/sdk";
import { buildF, BuiltArgument, fileSystemAutocompleter } from "../framework/features";
import { CloudPath } from "./util/cloudPath";


export type X = {
	FeatureContext: {
		filen: FilenSDK
		cloudWorkingPath: CloudPath
	}
	Feature: {
		skipAuthentication: boolean
	}
}
const _f = buildF<X>()
const cloudPath = ({ restrictType, skipCheckExists }: { restrictType?: "file" | "directory"; skipCheckExists?: boolean} , arg: BuiltArgument<X, string | undefined>): BuiltArgument<X, CloudPath> => ({
	spec: {
		...arg.spec,
		autocomplete: fileSystemAutocompleter({
			restrictToDirectories: restrictType === "directory",
			exists: async ({ x }, path) => {
				try {
					await x.filen.fs().stat({ path: x.cloudWorkingPath.navigate(path).toString() })
					return true
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") return false
					throw e
				}
			},
			readdir: async ({ x }, pathStr) => {
				const path = x.cloudWorkingPath.navigate(pathStr).toString()
				// to get the list of items in a directory with type, first readdir() to populate the cache, and then access the internal cache directly
				try {
					await x.filen.fs().readdir({ path })
					return Object.entries(x.filen.fs()._items)
						.filter(([cachedPath]) => cachedPath.startsWith(path) && cachedPath !== path)
						.map(([cachedPath, item]) => ({
							name: cachedPath.includes("/") ? cachedPath.substring(cachedPath.lastIndexOf("/") + 1) : cachedPath,
							isDirectory: item.type === "directory"
						}))
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") return []
					throw e
				}
			},
			isDirectory: async ({ x }, path) => {
				try {
					const stat = await x.filen.fs().stat({ path: x.cloudWorkingPath.navigate(path).toString() })
					return stat.type === "directory"
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") return false
					throw e
				}
			}
		})
	},
	value: async (ctx) => {
		const path = ctx.x.cloudWorkingPath.navigate((await arg.value(ctx)) ?? "")
		if (!skipCheckExists) {
			const stat = await (async () => {
				try {
					return await ctx.x.filen.fs().stat({ path: path.toString() })
				} catch (e) {
					if (e instanceof Error && e.name === "FileNotFoundError") {
						ctx.app.errExit(`No such cloud ${restrictType ?? "path"}: ${path.toString()}`)
					}
					throw e
				}
			})()
			if (restrictType !== undefined && stat.type !== restrictType) {
				ctx.app.errExit(`Not a ${restrictType}: ${path.toString()}`)
			}
		}
		return path
	}
})
export const f = { ..._f, cloudPath }
