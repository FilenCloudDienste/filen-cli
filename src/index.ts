import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import interactive from "./interactive"
import { err, errExit, out, prompt } from "./interface"

const args = arg({
    // arguments
    "--help": Boolean,

    // aliases
    "-h": "--help"
})

if (args["--help"] || args["_"].length == 0) {
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

    if (args["_"][0] == "interactive") {
        out("Interactive console:")
        await interactive(filen)
    } else {
        err(`Invalid command: ${args["_"][0]}}`)
    }

})()
