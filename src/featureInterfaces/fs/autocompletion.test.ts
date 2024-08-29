import { autocomplete, Item } from "./autocompletion"
import { CloudPath } from "../../util/cloudPath"
import { fsCommands } from "./commands"

const rootPath = new CloudPath([])
const sampleFolder: Item[] = [
	{ name: "test1.txt", type: "file" },
	{ name: "my file.txt", type: "file" }
]

function makeReadDirectoryFunction(items: {location: string, items: Item[]}[] = [], strict: boolean = true) {
	return async (path: string) => {
		for (const item of items) {
			if (path === item.location) return item.items
		}
		if (strict) throw Error(`No such location in mocked file system: ${path}`)
		return []
	}
}

test("command aliases when autocompleting commands", async () => {
	expect(
		await autocomplete("ren", rootPath, fsCommands, makeReadDirectoryFunction(), makeReadDirectoryFunction())
	).toEqual([["rename "], "ren"])
})
test("command aliases when autocompleting arguments", async () => {
	expect(
		await autocomplete("rename tes", rootPath, fsCommands, makeReadDirectoryFunction([{ location: "", items: sampleFolder }]), makeReadDirectoryFunction())
	).toEqual([["test1.txt"], "tes"])
})

test("handle unknown command", async () => {
	expect(
		await autocomplete("asdf", rootPath, fsCommands, makeReadDirectoryFunction(), makeReadDirectoryFunction())
	).toEqual([[], "asdf"])
})
test("handle unknown argument", async () => {
	expect(
		await autocomplete("cat file.txt asdf", rootPath, fsCommands, makeReadDirectoryFunction(), makeReadDirectoryFunction())
	).toEqual([[], "cat file.txt asdf"])
})

test("handle subfolders", async () => {
	expect(
		await autocomplete("cat folder/t", rootPath, fsCommands, makeReadDirectoryFunction([{ location: "/folder", items: sampleFolder }]), makeReadDirectoryFunction())
	).toEqual([["folder/test1.txt"], "folder/t"])
})

test("handle spaces", async () => {
	expect(
		await autocomplete("cat folder/m", rootPath, fsCommands, makeReadDirectoryFunction([{ location: "/folder", items: sampleFolder }]), makeReadDirectoryFunction())
	).toEqual([["\"folder/my file.txt\""], "folder/m"])
})

test("enforce directory when needed", async () => {
	const items: Item[] = [
		{ name: "file.txt", type: "file" },
		{ name: "folder", type: "directory" }
	]
	expect(
		await autocomplete("cd f", rootPath, fsCommands, makeReadDirectoryFunction([{ location: "", items }]), makeReadDirectoryFunction())
	).toEqual([["folder"], "f"])
})

test("handle local files", async () => {
	expect(
		await autocomplete("upload t", rootPath, fsCommands, makeReadDirectoryFunction(), makeReadDirectoryFunction([{ location: "", items: sampleFolder }]))
	).toEqual([["test1.txt"], "t"])
})

const readCloudDirectoryFileWithFolders = makeReadDirectoryFunction([
	{
		location: "",
		items: [
			{ name: "folder", type: "directory" }
		]
	},
	{
		location: "/folder",
		items: [
			{ name: "file1.txt", type: "file" },
			{ name: "file2.txt", type: "file" }
		]
	}
])
test("autocomplete from folder", async () => {
	expect(
		await autocomplete("more folder", rootPath, fsCommands, readCloudDirectoryFileWithFolders, makeReadDirectoryFunction())
	).toEqual([["folder/file1.txt", "folder/file2.txt"], "folder"])
})
test("autocomplete from file name part", async () => {
	expect(
		await autocomplete("more folder/file1", rootPath, fsCommands, readCloudDirectoryFileWithFolders, makeReadDirectoryFunction())
	).toEqual([["folder/file1.txt"], "folder/file1"])
})