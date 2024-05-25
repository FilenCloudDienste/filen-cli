import { splitCommandSegments } from "./commands"

describe("splitCommandSegments()", () => {

	test("simple splitting", () => {
		expect(splitCommandSegments("cd folder name")).toEqual(["cd", "folder", "name"])
	})

	test("with quotes", () => {
		expect(splitCommandSegments("cd \"folder name\"")).toEqual(["cd", "\"folder name\""])
	})

})
