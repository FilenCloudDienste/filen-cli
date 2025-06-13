import { beforeAll, describe, expect, test } from "vitest"
import { authenticatedFilenSDK, clearTestDir, MockApp, testDir } from "../../test/tests"
import fs from "fs/promises"
import path from "path"
import { exists } from "../util/util"
import { mockNotes, markdownNoteParsed } from "../test/prepareCloud"

test.todo("export notes")

// todo: update to features architecture

/* describe("export notes", () => {

    const exportDir = path.join(testDir, "exportNotes")

    beforeAll(async () => {
        await clearTestDir()
        const app = new MockApp()
        const filen = await authenticatedFilenSDK()
        await fs.mkdir(exportDir, { recursive: true })
        await new ExportNotesInterface(app, filen).invoke([exportDir])
    })

    test("plain text file", async () => {
        const file = path.join(exportDir, "Plain Text.txt")
        expect(await exists(file)).toBe(true)
        const content = await fs.readFile(file, "utf-8")
        expect(content).toBe(mockNotes.find(note => note.title === "Plain Text")!.content)
    })

    test("duplicate title", async () => {
        const file1 = path.join(exportDir, "Same Title.txt")
        expect(await exists(file1)).toBe(true)
        const content1 = await fs.readFile(file1, "utf-8")

        const file2 = path.join(exportDir, "Same Title-1.txt")
        expect(await exists(file2)).toBe(true)
        const content2 = await fs.readFile(file2, "utf-8")
        
        const expectedContent = mockNotes.find(note => note.title === "Same Title")!.content
        expect([content1, content2].sort()).toEqual([expectedContent.replace(/(1|2)/, "1"), expectedContent.replace(/(1|2)/, "2")])
    })

    test("markdown file", async () => {
        const file = path.join(exportDir, "Markdown.md")
        expect(await exists(file)).toBe(true)
        const content = await fs.readFile(file, "utf-8")
        expect(content).toBe(mockNotes.find(note => note.title === "Markdown")!.content)
    })

    test("checklist file", async () => {
        const file = path.join(exportDir, "Checklist.md")
        expect(await exists(file)).toBe(true)
        const content = await fs.readFile(file, "utf-8")
        expect(content).toBe(markdownNoteParsed)
    })

    test("rich text file", async () => {
        const file = path.join(exportDir, "Rich Text.html")
        expect(await exists(file)).toBe(true)
        const content = await fs.readFile(file, "utf-8")
        expect(content).toBe(mockNotes.find(note => note.title === "Rich Text")!.content)
    })

    test("code file", async () => {
        const file = path.join(exportDir, "Code.txt")
        expect(await exists(file)).toBe(true)
        const content = await fs.readFile(file, "utf-8")
        expect(content).toBe(mockNotes.find(note => note.title === "Code")!.content)
    })

}) */