import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import { err, errExit, out, prompt } from "./interface"
import { executeCommand, resolveCloudPath } from "./fs"
import * as fs from "node:fs"

const args = arg({
    // arguments
    "--help": Boolean,

    // aliases
    "-h": "--help"
})

if (args["--help"]) {
    console.log("Filen CLI v0.0.1")
    process.exit()
}

(async () => {

    const filen = new FilenSDK({
        metadataCache: true,
        tmpPath: path.join(os.tmpdir(), "filen-cli")
    })

    if (fs.existsSync(".filen-cli-credentials")) {
        const lines = fs.readFileSync(".filen-cli-credentials").toString().split("\n")
        if (lines.length < 2) errExit("Invalid .filen-cli-credentials!")
        await filen.login({email: lines[0], password: lines[1]})
    } else {
        out("Please enter your Filen credentials:")
        const email = await prompt("Email: ")
        const password = await prompt("Password: ")
        if (!email || !password) errExit("Please provide your credentials!")
        await filen.login({ email, password })
        out("")
    }

    if (args["_"].length == 0) {
        let cloudWorkingPath: string[] = []
        while (true) {
            const command = await prompt(`${resolveCloudPath(cloudWorkingPath)} > `)
            const cmd = command.split(" ")[0].toLowerCase()
            const args = command.split(" ").splice(1)
            const result = await executeCommand(filen, cloudWorkingPath, cmd, args)
            if (result.exit) break
            if (result.cloudWorkingPath != undefined) cloudWorkingPath = result.cloudWorkingPath
        }
    } else {
        const result = await executeCommand(filen, [], args["_"][0], args["_"].slice(1))
        if (result.cloudWorkingPath != undefined) err("To navigate in a stateful environment, please invoke the CLI without any arguments.")
    }
    process.exit()

})()