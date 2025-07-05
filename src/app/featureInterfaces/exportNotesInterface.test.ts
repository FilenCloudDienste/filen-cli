import { beforeAll, describe, expect, test } from "vitest"
import { authenticatedFilenSDK, runMockApp } from "../../test/tests"
import fs from "fs/promises"
import path from "path"
import { exists } from "../util/util"
import { prepareLocalFs } from "../../test/fsTests"
import dedent from "dedent"
import { NoteType } from "@filen/sdk/dist/types/api/v3/notes"
import { randomUUID } from "crypto"

const mockNotes: { title: string, type: NoteType, content: string }[] = [
    { title: "Plain Text", type: "text", content: "This is some text" },
    { title: "Markdown", type: "md", content: "# Title\nSome **formatting**." },
    { title: "Same Title", type: "text", content: "This is same title note 1" },
    { title: "Same Title", type: "text", content: "This is same title note 2" },
    { title: "Checklist", type: "checklist", content: "<ul data-checked=\"false\"><li>Item 1</li><li>Item 2</li></ul><ul data-checked=\"true\"><li>Checked item</li></ul><ul data-checked=\"false\"><li>other</li></ul>" },
    { title: "Rich Text", type: "rich", content: "<p>This is a te<u>st with </u><strong><u>form</u>atting in all sorts</strong> <em>of ways</em> <u>differently</u>.</p>" },
    { title: "Code", type: "code", content: "<!doctype html>\n    <body>\n        <h1>Code note</h1>\n    </body>\n</html>" }
]
const markdownNoteParsed = dedent`
    - [ ] Item 1
    - [ ] Item 2
    - [x] Checked item
    - [ ] other
`

describe("export notes", async () => {

    let exportDir = ""
    beforeAll(async () => {
        const filen = await authenticatedFilenSDK()
        // prepare notes
        const existingNotes = await filen.notes().all()
        await Promise.all(existingNotes.map(note => filen.notes().delete({ uuid: note.uuid })))
        await Promise.all(mockNotes.map(async (note) => {
            const uuid = randomUUID()
            await filen.notes().create({ uuid, title: note.title })
            await filen.notes().changeType({ uuid, newType: note.type })
            await filen.notes().edit({ uuid, content: note.content, type: note.type })
        }))

        // run export notes
        const { localRoot } = await prepareLocalFs([])
        exportDir = localRoot
        await runMockApp({ cmd: `export-notes ${exportDir}` })
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

})