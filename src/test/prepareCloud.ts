// Usage: npm run prepare-testing

import FilenSDK, { FilenSDKConfig } from "@filen/sdk"
import "dotenv/config"
import dedent from "dedent"

const LOCK_FILE = "CLI_AUTOMATED_TESTING_IN_PROGRESS"

async function main() {

    // print help
    if (process.argv.length === 2) {
        console.log(dedent`
            Usage:

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

}

// execute
if (process.argv.join().includes("prepareCloud")) { // run only if invoked directly
    main().then(() => process.exit(0))
}