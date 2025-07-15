import { describe, expect, test } from "vitest"
import FilenSDK from "@filen/sdk"
import { CloudPath } from "./cloudPath"

describe("navigate()", () => {

	test("navigate to subdirectory", () => {
		expect(
			new CloudPath(["f1"]).navigate("f2").cloudPath
		).toEqual(["f1", "f2"])
	})

	test("handle trailing '/'", () => {
		expect(
			new CloudPath(["f1"]).navigate("f2/").cloudPath
		).toEqual(["f1", "f2"])
	})

	test("navigate multiple subdirectories", () => {
		expect(
			new CloudPath(["f1"]).navigate("f2/f3").cloudPath
		).toEqual(["f1", "f2", "f3"])
	})

	test("navigate from root", () => {
		expect(
			new CloudPath([]).navigate("f1").cloudPath
		).toEqual(["f1"])
	})

	test("handle '.'", () => {
		expect(
			new CloudPath(["f1"]).navigate(".").cloudPath
		).toEqual(["f1"])
	})

	test("handle '..'", () => {
		expect(
			new CloudPath(["f1", "f2"]).navigate("..").cloudPath
		).toEqual(["f1"])
	})

	test("strip '\"'", () => {
		expect(
			new CloudPath(["f1"]).navigate("\"my folder\"").cloudPath
		).toEqual(["f1", "my folder"])
	})

})

describe("navigateAndAppendFileNameIfNecessary()", () => {

	const filen = {
		fs: () => {return {
			stat: async (params: {path: string}) => {
				return params.path === "/folder" ? { isDirectory: () => true } : { isDirectory: () => false }
			}
		}}
	}

	test("appending necessary", async () => {
		expect(
			(await new CloudPath(["folder"]).appendFileNameIfNecessary(filen as unknown as FilenSDK, "file.txt")).cloudPath
		).toEqual(["folder", "file.txt"])
	})

	test("appending not necessary", async () => {
		expect(
			(await new CloudPath(["folder", "any_file.txt"]).appendFileNameIfNecessary(filen as unknown as FilenSDK, "file.txt")).cloudPath
		).toEqual(["folder", "any_file.txt"])
	})

})