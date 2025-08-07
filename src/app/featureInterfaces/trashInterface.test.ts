import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { authenticatedFilenSDK, ResourceLock, runMockApp } from "../../test/tests"
import { prepareCloudFs } from "../../test/fsTests"
import { CloudPath } from "../util/cloudPath"
import { waitForAsyncEndpoint } from "./fs.test"

describe("trash", async () => {
    // needs to run sequentially

    const lock = new ResourceLock("trash")
    beforeAll(async () => await lock.acquire())
    afterAll(async () => await lock.release())

    const filen = await authenticatedFilenSDK()
    let root: CloudPath = new CloudPath([])

    beforeAll(async () => {
        await filen.cloud().emptyTrash()
        root = (await prepareCloudFs([ "trashtest_file1.txt", "trashtest_file2.txt" ])).root
        await filen.fs().rm({ path: root.navigate("trashtest_file1.txt").toString(), permanent: false })
        await filen.fs().rm({ path: root.navigate("trashtest_file2.txt").toString(), permanent: false })
    })

    it("should list trash items", async () => {
        await waitForAsyncEndpoint()
        const { output } = await runMockApp({ cmd: "trash list" })
        expect(output()).toContain("trashtest_file1.txt")
        expect(output()).toContain("trashtest_file2.txt")
    })

    // when there are multiple test suites running concurrently, these tests don't work as expected
    // the way to input which trash item to delete or restore assumes there are no other items
    // there is no easy way to fix this, so I'm disabling these tests for now
    // it works now; if there are changes to the code these tests test,
    // just run these tests locally where there is no interference from other test suites

    /* it("should delete trash item", async () => {
        const { isInputEmpty } = await runMockApp({ cmd: "trash delete", input: ["1", "y"] })
        expect(isInputEmpty()).toBe(true)
    })

    it("should restore trash item", async () => {
        const { isInputEmpty } = await runMockApp({ cmd: "trash restore", input: ["1"] })
        expect(isInputEmpty()).toBe(true)
        // will check if restore action was called in next test
    })

    it("should list empty trash", async () => {
        await waitForAsyncEndpoint()
        const { output } = await runMockApp({ cmd: "trash list" })
        expect(output()).not.toContain("trashtest_file1.txt")
        expect(output()).not.toContain("trashtest_file2.txt")
        // there might be other test suites running concurrently, so we can't check that it's completely empty
    }) */

})