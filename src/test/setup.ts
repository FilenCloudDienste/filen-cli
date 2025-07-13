// prepareCloudFs leaves behind many files that should be cleaned up after testing, but should also be accessible immediately after the test run for debugging
// -> "prepareCloudFs" folder is marked as deleted after all tests are done, and will be deleted at the start of the next test suite run

import { randomUUID } from "crypto"
import { authenticatedFilenSDK } from "./tests"
import type { TestProject } from "vitest/node"
import { prepareCloudFsRoot } from "./constants"

const testRunId = randomUUID()

export async function setup(project: TestProject) {
    project.provide("testRunId", testRunId)
    try { await (await authenticatedFilenSDK()).fs().rm({ path: prepareCloudFsRoot(testRunId).navigate("../prepareCloudFs-last-run").toString() }) } catch {/**/}
}

export async function teardown() {
    try { await (await authenticatedFilenSDK()).fs().rename({ from: prepareCloudFsRoot(testRunId).toString(), to: prepareCloudFsRoot(testRunId).navigate("../prepareCloudFs-last-run").toString() }) } catch (e) { console.error(e) }
}

declare module "vitest" {
    export interface ProvidedContext {
        testRunId: string
    }
}