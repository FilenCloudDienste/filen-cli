import { splitCommandSegments } from "./commands"

test("splitCommandSegments simple splitting", () => {
	expect(splitCommandSegments("cd folder name")).toEqual(["cd", "folder", "name"])
})

test("splitCommandSegments with quotes", () => {
	expect(splitCommandSegments("cd \"folder name\"")).toEqual(["cd", "\"folder name\""])
})