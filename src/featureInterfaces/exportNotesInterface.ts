import FilenSDK from "@filen/sdk"
import { errExit, out, quiet } from "../interface/interface"
import * as pathModule  from "path"
import fs from "fs/promises"
import { exists, sanitizeFileName } from "../util/util"
import dateFormat from "dateformat"
import * as cheerio from "cheerio"

/**
 * Provides the interface for exporting notes.
 */
export class ExportNotesInterface {
    private readonly filen

    constructor(filen: FilenSDK) {
        this.filen = filen
    }

    public async invoke(args: string[]) {
        // determine export path
        if (args.length !== 1) errExit("Invalid usage! See filen -h fs for more info.");
        const exportRoot = await (async () => {
            try {
                const path = pathModule.resolve(args[0]!)
                
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
                errExit("determine export path", e)
            }
        })()

        // fetch notes and write to disk
        const notes = await this.filen.notes().all()
        await Promise.all(notes.map(note => (async () => {
            try {
                let { content } = await this.filen.notes().content({ uuid: note.uuid })

                // convert to readable format, choose file ending
                if (note.type === "checklist") content = this.convertChecklistHTMLToMarkdown(content)
                const fileEnding = (() => {
                    if (note.type === "rich") return "html"
                    if (note.type === "md" || note.type === "checklist") return "md"
                    return "txt"
                })()

                // find unique file name
                let file; let i = 0
                for (let i = 0; i === 0 || await exists(file!); i++) {
                    file = pathModule.join(exportRoot, `${sanitizeFileName(note.title)}${i === 0 ? "" : `-${i}`}.${fileEnding}`)
                }

                await fs.writeFile(file!, content)
            } catch (e) {
                errExit(`export note "${note.title}" (${note.uuid})`, e)
            }
        })()))

        if (!quiet) out(`Exported notes to ${exportRoot}`)
        process.exit()
    }

    private convertChecklistHTMLToMarkdown(html: string) {
        const checklist: {checked: boolean, text: string}[] = []

        // read checklist
        const $ = cheerio.load(html);
        $('ul').each((_, ul) => {
            const isChecked = $(ul).attr('data-checked') === 'true';
            $(ul).find('li').each((_, li) => {
                const text = $(li).text().trim();
                checklist.push({ checked: isChecked, text });
            });
        });

        // convert to markdown
        return checklist.map(item => `- ${item.checked ? '[x]' : '[ ]'} ${item.text}`).join('\n')
    }
}