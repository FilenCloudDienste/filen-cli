// Usage: npm run prepare-testing

import FilenSDK, { FilenSDKConfig } from "@filen/sdk"
import "dotenv/config"
import { NoteType } from "@filen/sdk/dist/types/api/v3/notes"
import dedent from "dedent"
import { randomUUID } from "crypto"

const LOCK_FILE = "CLI_AUTOMATED_TESTING_IN_PROGRESS"

const availableSections: Record<string, (filen: FilenSDK, allowOverwrite?: boolean) => Promise<void>> = {
    "notes": prepareNotes,
}

if (process.argv.join().includes("prepareCloud")) (async () => { // run only if invoked directly

    // print help
    if (process.argv.length === 2) {
        console.log(dedent`
            Usage:

            npm run prepare-testing [overwrite] <sections...>
              Prepare the cloud drive for testing (only selected sections).
              If 'overwrite' is provided, it will delete existing resources in the cloud drive.
              Available sections: ${Object.keys(availableSections).map(s => `'${s}'`).join(", ")} (or 'all')

            npm run prepare-testing lock
              Creates a file '${LOCK_FILE}' in the cloud drive, which is used to prevent
              multiple instances of the test suite from running at the same time.
              Fails (exit code 1) if the file already exists.
            
            npm run prepare-testing unlock
              Deletes the file '${LOCK_FILE}' in the cloud drive.\n
        `)
        process.exit(0)
    }

    // setup Filen SDK
    if (!process.env.FILEN_CLI_TESTING_EMAIL || !process.env.FILEN_CLI_TESTING_PASSWORD) {
        console.error("Please set FILEN_CLI_TESTING_EMAIL and FILEN_CLI_TESTING_PASSWORD in your .env file.")
        process.exit(1)
    }
    const filen = new FilenSDK()
    if (process.env.FILEN_CLI_TESTING_AUTHCONFIG) {
        const authConfig = JSON.parse(Buffer.from(process.env.FILEN_CLI_TESTING_AUTHCONFIG, "base64").toString()) as FilenSDKConfig
        filen.init(authConfig)
    } else {
        await filen.login({
            email: process.env.FILEN_CLI_TESTING_EMAIL,
            password: process.env.FILEN_CLI_TESTING_PASSWORD,
        })
    }

    // command: lock
    if (process.argv.includes("lock")) {
        const fileExists = await filen.cloud().fileExists({ parent: await filen.user().baseFolder(), name: LOCK_FILE })
        if (fileExists.exists) {
            console.error(`File '${LOCK_FILE}' exists, indicating that there are tests currently running.`)
            process.exit(1)
        } else {
            await filen.fs().writeFile({ path: LOCK_FILE, content: Buffer.from("This file is used to prevent multiple instances of the test suite from running at the same time.") })
            console.log(`File '${LOCK_FILE}' created.`)
            process.exit(0)
        }
    }

    // command: unlock
    if (process.argv.includes("unlock")) {
        const fileExists = await filen.cloud().fileExists({ parent: await filen.user().baseFolder(), name: LOCK_FILE })
        if (!fileExists) {
            console.error(`File '${LOCK_FILE}' does not exist.`)
        } else {
            await filen.fs().rm({ path: LOCK_FILE })
            console.log(`File '${LOCK_FILE}' deleted.`)
        }
        process.exit(0)
    }

    // determine sections
    const sections = process.argv.slice(2).filter(str => str !== "overwrite")
    if (sections[0] === "all") {
        sections.pop()
        sections.push(...Object.keys(availableSections))
    }
    console.log(`Preparing cloud drive for testing. Sections: [${sections.join(", ")}]`)

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

})().then(() => process.exit())

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