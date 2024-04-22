import FilenSDK from "@filen/sdk"
import {out, err, prompt} from "./interface"

export default async function interactive(filen: FilenSDK) {
    const navigate = (cloudWorkingPath: string[], path: string) => {
        if (path.startsWith("/")) return path.substring(1).split("/")
        else return [...cloudWorkingPath, path]
    }
    const resolve = (cloudWorkingPath: string[]) => {
        return "/" + cloudWorkingPath.join("/")
    }

    let cloudWorkingPath: string[] = []
    while (true) {
        const input = await prompt(`${resolve(cloudWorkingPath)} > `)
        const cmd = input.split(" ")[0].toLowerCase()
        const args = input.split(" ").splice(1)

        if (cmd == "cd") {

            if (args.length < 1) {
                err("Need to provide arg 0: directory")
                continue
            }
            let path = navigate(cloudWorkingPath, args[0])
            try {
                const directory = await filen.fs().stat({path: resolve(path)})
                if (!directory.isDirectory()) err("Not a directory")
            } catch (e) {
                err("No such directory")
            }
            continue

        }
        if (cmd == "ls") {

            const output = await filen.fs().readdir({path: resolve(cloudWorkingPath)})
            out(output.join("   "))
            continue

        }
        if (cmd == "more") {

            if (args.length < 1) {
                err("Need to provide arg 0: file")
                continue
            }
            const path = navigate(cloudWorkingPath, args[0])
            try {
                out((await filen.fs().readFile({path: resolve(path)})).toString())
            } catch (e) {
                err("No such file")
            }
            continue

        }
        if (cmd == "mkdir") {

            if (args.length < 1) {
                err("Need to provide arg 0: directory name")
                continue
            }
            await filen.fs().mkdir({path: resolve(navigate(cloudWorkingPath, args[0]))})
            continue

        }
        if (cmd == "rm") {

            if (args.length < 1) {
                err("Need to provide arg 0: name")
                continue
            }
            try {
                await filen.fs().rm({path: resolve(navigate(cloudWorkingPath, args[0]))})
            } catch (e) {
                err("No such file or directory")
            }
            continue

        }

        if (cmd == "exit") return
        err(`Unknown command: ${cmd}`)
    }
}
