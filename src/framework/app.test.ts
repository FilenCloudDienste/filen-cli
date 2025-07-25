import { describe, test, expect } from "vitest"
import { splitCommandSegments } from "./app"

describe("splitCommandSegments()", () => {

	test("simple splitting", () => {
		expect(splitCommandSegments("cd folder name")).toEqual(["cd", "folder", "name"])
	})

	test("with quotes", () => {
		expect(splitCommandSegments("cd \"folder name\"")).toEqual(["cd", "\"folder name\""])
	})

	test("multiple segments with quotes", () => {
		expect(splitCommandSegments("cd \"folder name\" to \"other folder\"")).toEqual(["cd", "\"folder name\"", "to", "\"other folder\""])
	})

})
