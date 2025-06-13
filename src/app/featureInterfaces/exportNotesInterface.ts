import * as pathModule  from "path"
import fs from "fs/promises"
import dateFormat from "dateformat"
import * as cheerio from "cheerio"
import dedent from "dedent"
import { f } from "../f"
import { exists, sanitizeFileName } from "../util/util"

export const exportNotesCommand = f.feature({
    cmd: ["export-notes"],
    description: "Exports all Notes to the specified path.",
    longDescription: dedent`
        If the specified directory doesn't exist, it will be created.
        If it is not empty, a subdirectory will be created with the name "filen-notes-export-<timestamp>".
        Richtext notes are exported as HTML. Checklist notes are converted to markdown.
    `,
    args: {
        path: f.localPath({}, f.defaultValue(".", f.optionalArg({ name: "path", description: "local path to export notes to" }))),
    },
    invoke: async ({ app, filen, args }) => {
        // determine export path
        const exportRoot = await (async () => {
            try {
                const path = pathModule.resolve(args.path ?? ".")

                // if path doesn't exist, create it
                if ((await exists(path)) === false) {
                    await fs.mkdir(path, { recursive: true })
                    return path.toString()
                }

                // if path is non-empty, create a subdirectory
                if ((await fs.readdir(path)).length === 0) {
                    return path.toString()
                } else {
                    const exportRoot = pathModule.join(path, `filen-notes-export-${dateFormat(Date.now(), "yyyy-mm-dd-HH-MM-ss")}`)
                    await fs.mkdir(exportRoot, { recursive: true })
                    return exportRoot
                }
            } catch (e) {
                return app.errExit("determine export path", e)
            }
        })()

        // fetch notes and write to disk
        const notes = await filen.notes().all()
        await Promise.all(notes.map(note => (async () => {
            try {
                let { content } = await filen.notes().content({ uuid: note.uuid })

                // convert to readable format, choose file ending
                if (note.type === "checklist") content = convertChecklistHTMLToMarkdown(content)
                const fileEnding = (() => {
                    if (note.type === "rich") return "html"
                    if (note.type === "md" || note.type === "checklist") return "md"
                    return "txt"
                })()

                // find unique file name
                let file
                for (let i = 0; i === 0 || await exists(file!); i++) {
                    file = pathModule.join(exportRoot, `${sanitizeFileName(note.title)}${i === 0 ? "" : `-${i}`}.${fileEnding}`)
                }

                await fs.writeFile(file!, content)
            } catch (e) {
                app.errExit(`export note "${note.title}" (${note.uuid})`, e)
            }
        })()))

        app.outUnlessQuiet(`Exported notes to ${exportRoot}`)
    }
})

function convertChecklistHTMLToMarkdown(html: string) {
    const checklist: {checked: boolean, text: string}[] = []

    // read checklist
    const $ = cheerio.load(html);
    $("ul").each((_, ul) => {
        const isChecked = $(ul).attr("data-checked") === "true";
        $(ul).find("li").each((_, li) => {
            const text = $(li).text().trim();
            checklist.push({ checked: isChecked, text });
        });
    });

    // convert to markdown
    return checklist.map(item => `- ${item.checked ? "[x]" : "[ ]"} ${item.text}`).join("\n")
}