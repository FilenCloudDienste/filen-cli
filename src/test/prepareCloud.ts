// Usage: npm run prepare-testing

import FilenSDK from "@filen/sdk"
import "dotenv/config"
import { NoteType } from "@filen/sdk/dist/types/api/v3/notes"
import dedent from "dedent"
import { randomUUID } from "crypto"

const availableSections: Record<string, (filen: FilenSDK, allowOverwrite?: boolean) => Promise<void>> = {
    "notes": prepareNotes,
}

if (process.argv.join().includes("prepareCloud")) (async () => { // run only if invoked directly

    // print help
    if (process.argv.length === 2) {
        console.log(dedent`
            Usage: npm run prepare-testing [overwrite] <sections...>
            Available sections: ${Object.keys(availableSections).map(s => `'${s}'`).join(", ")} (or 'all')
        `)
        process.exit(0)
    }

    // determine sections
    const sections = process.argv.slice(2).filter(str => str !== "overwrite")
    if (sections[0] === "all") {
        sections.pop()
        sections.push(...Object.keys(availableSections))
    }
    console.log(`Preparing cloud drive for testing. Sections: [${sections.join(", ")}]`)

    // check environment
    if (!process.env.FILEN_CLI_TESTING_EMAIL || !process.env.FILEN_CLI_TESTING_PASSWORD) {
        console.error("Please set FILEN_CLI_TESTING_EMAIL and FILEN_CLI_TESTING_PASSWORD in your .env file.")
        process.exit(1)
    }
    
    // setup FilenSDK
    const filen = new FilenSDK()
    await filen.login({
        email: process.env.FILEN_CLI_TESTING_EMAIL,
        password: process.env.FILEN_CLI_TESTING_PASSWORD,
    })
    if (filen.config.email === "anonymous") {
        console.error("Could not login using credentials provided with FILEN_CLI_TESTING_EMAIL and FILEN_CLI_TESTING_PASSWORD.")
        process.exit(1)
    }

    // execute sections
    console.log()
    const allowOverwrite = process.argv.includes("overwrite")
    await Promise.all(Object.keys(availableSections).map(section => (async () => {
        const prepareSection = availableSections[section]!
        console.log(`Preparing ${section}...`)
        await prepareSection(filen, allowOverwrite)
        console.log(`Done preparing ${section}.\n`)
    })()))

    console.log("All done.")

})()

export class NoOverwriteError extends Error {
    constructor(context: string) {
        super(`What you're attempting to prepare in the cloud drive (section: ${context}) is not empty. Please use the \`overwrite\` flag to overwrite it.`)
    }
}


// section: notes

export const mockNotes: { title: string, type: NoteType, content: string }[] = [
    { title: "Plain Text", type: "text", content: "This is some text" },
    { title: "Markdown", type: "md", content: "# Title\nSome **formatting**." },
    { title: "Same Title", type: "text", content: "This is same title note 1" },
    { title: "Same Title", type: "text", content: "This is same title note 2" },
    { title: "Checklist", type: "checklist", content: "<ul data-checked=\"false\"><li>Item 1</li><li>Item 2</li></ul><ul data-checked=\"true\"><li>Checked item</li></ul><ul data-checked=\"false\"><li>other</li></ul>" },
    { title: "Rich Text", type: "rich", content: "<p>This is a te<u>st with </u><strong><u>form</u>atting in all sorts</strong> <em>of ways</em> <u>differently</u>.</p>" },
    { title: "Code", type: "code", content: "<!doctype html>\n    <body>\n        <h1>Code note</h1>\n    </body>\n</html>" }
]
export const markdownNoteParsed = dedent`
    - [ ] Item 1
    - [ ] Item 2
    - [x] Checked item
    - [ ] other
`

export async function prepareNotes(filen: FilenSDK, allowOverwrite: boolean = false) {
    const existingNotes = await filen.notes().all()
    if (existingNotes.length > 0) {
        if (allowOverwrite) {
            await Promise.all(existingNotes.map(note => filen.notes().delete({ uuid: note.uuid })))
        } else {
            throw new NoOverwriteError("notes")
        }
    }

    await Promise.all(mockNotes.map(async (note) => {
        const uuid = randomUUID()
        await filen.notes().create({ uuid, title: note.title })
        await filen.notes().changeType({ uuid, newType: note.type })
        await filen.notes().edit({ uuid, content: note.content, type: note.type })
    }))
}