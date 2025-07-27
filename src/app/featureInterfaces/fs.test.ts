import { beforeAll, describe, expect, it } from "bun:test"
import { runMockApp } from "../../test/tests"
import { file, largeFile, prepareCloudFs, prepareLocalFs } from "../../test/fsTests"
import { CloudPath } from "../util/cloudPath"

describe("fs commands", async () => {
    // could run in parallel, but bun test doesn't support concurrency
    
    describe("ls", () => {
        let root = {} as CloudPath
        beforeAll(async () => {
            root = (await prepareCloudFs([ "file1.txt", "file2.txt", "lsfolder/file1.txt", "lsfolder/file2.txt" ])).root
        })
        it("should list files in home directory", async () => {
            const { output } = await runMockApp({ cmd: "ls", root })
            expect(output()).toContain("file1.txt  file2.txt")
            expect(output()).toContain("lsfolder")
        })
        it("should list files in specified directory", async () => {
            const { output } = await runMockApp({ cmd: "ls lsfolder", root })
            expect(output()).toContain("file1.txt  file2.txt")
        })
        it("should list files as json", async () => {
            const { output } = await runMockApp({ cmd: "ls --json", root })
            expect(JSON.parse(output())).toContain("file1.txt")
        })
        it("should list files using long listing format", async () => {
            const { output } = await runMockApp({ cmd: "ls --long", root })
            expect(output()).toContain("19 B")
            expect(output()).toContain("file1.txt")
        })
    })
    
    describe("cat", () => {
        
        it("should display file content", async () => {
            const { root } = await prepareCloudFs([ file("catfile.txt", "This is a file to be displayed with cat command") ])
            const { output } = await runMockApp({ cmd: "cat catfile.txt", root })
            expect(output()).toContain("This is a file to be displayed with cat command")
        })
        it("should ask before displaying huge file", async () => {
            const { root } = await prepareCloudFs([ largeFile() ])
            const { isInputEmpty } = await runMockApp({ cmd: "cat 1mb.txt", input: ["N"], root })
            expect(isInputEmpty()).toBe(true)
        })
    })
    
    describe("head/tail", () => {
        let root = {} as CloudPath
        beforeAll(async () => {
            root = (await prepareCloudFs([ file("longfile.txt", Array.from({ length: 15 }, (_, i) => (i + 1).toString()).join("\n")) ])).root
        })
        it("should display first 10 lines of file", async () => {
            const { output } = await runMockApp({ cmd: "head longfile.txt", root })
            expect(output()).toEqual(Array.from({ length: 10 }, (_, i) => i + 1).join("\n") + "\n")
        })
        it("should display last 10 lines of file", async () => {
            const { output } = await runMockApp({ cmd: "tail longfile.txt", root })
            expect(output()).toEqual(Array.from({ length: 10 }, (_, i) => i + 1).map(i => i + 5).join("\n") + "\n")
        })
        it("should display first 5 lines of file", async () => {
            const { output } = await runMockApp({ cmd: "head -n 5 longfile.txt", root })
            expect(output()).toEqual(Array.from({ length: 5 }, (_, i) => i + 1).join("\n") + "\n")
        })
    })
    
    describe("mkdir", () => {
        it("should create a new directory", async () => {
            const { root, actualTree, normalizeTree } = await prepareCloudFs([])
            await runMockApp({ cmd: "mkdir newdir", root })
            expect(await actualTree()).toEqual(normalizeTree([ "newdir/" ]))
        })
    })
    
    describe("rm", () => {
        it("should remove a file", async () => {
            const { root, actualTree, normalizeTree } = await prepareCloudFs([ "filetodelete.txt" ])
            const { isInputEmpty } = await runMockApp({ cmd: "rm filetodelete.txt", input: ["y"], root })
            expect(isInputEmpty()).toBe(true)
            await waitForAsyncEndpoint()
            expect(await actualTree()).toEqual(normalizeTree([]))
        })
        it("should remove a directory", async () => {
            const { root, actualTree, normalizeTree } = await prepareCloudFs([ "folder/" ])
            const { isInputEmpty } = await runMockApp({ cmd: "rm folder", input: ["y"], root })
            expect(isInputEmpty()).toBe(true)
            await waitForAsyncEndpoint()
            expect(await actualTree()).toEqual(normalizeTree([]))
        })
    })
    
    describe("stat", () => {
        it("should display file information", async () => {
            const { root } = await prepareCloudFs([ "file1.txt" ])
            const { output } = await runMockApp({ cmd: "stat file1.txt", root })
            expect(output()).toContain("file1.txt")
            expect(output()).toContain("Type: file")
            expect(output()).toContain("Size: 19 B") // size doesn't matter
        })
    })
    
    describe("whoami", () => {
        it("should display user information", async () => {
            const { filen, output } = await runMockApp({ cmd: "whoami" })
            expect(output()).toContain(filen.config.email)
        })
    })
    
    describe("mv", () => {
        it("should move a file", async () => {
            const { root, actualTree, normalizeTree } = await prepareCloudFs([ "mvfile.txt" ])
            await runMockApp({ cmd: "mv mvfile.txt mvfile_moved.txt", root })
            expect(await actualTree()).toEqual(normalizeTree([ "mvfile_moved.txt" ]))
        })
        it("should append file name if necesary", async () => {
            const { root, actualTree, normalizeTree } = await prepareCloudFs([ "mvfile.txt", "mvfolder/" ])
            await runMockApp({ cmd: "mv mvfile.txt mvfolder", root })
            expect(await actualTree()).toEqual(normalizeTree([ "mvfolder/mvfile.txt" ]))
        })
    })
    
    describe("cp", () => {
        it("should copy a file", async () => {
            const { root, actualTree, normalizeTree } = await prepareCloudFs([ "cpfile.txt" ])
            await runMockApp({ cmd: "cp cpfile.txt cpfile_copied.txt", root })
            expect(await actualTree()).toEqual(normalizeTree([ "cpfile.txt", "cpfile_copied.txt" ]))
        })
        it("should copy a file to a directory", async () => {
            const { root, actualTree, normalizeTree } = await prepareCloudFs([ "cpfile.txt", "cpfolder/" ])
            await runMockApp({ cmd: "cp cpfile.txt cpfolder/", root })
            expect(await actualTree()).toEqual(normalizeTree([ "cpfile.txt", "cpfolder/cpfile.txt" ]))
        })
    })
    
    describe("upload", () => {
        it("should upload a file to the current directory", async () => {
            const { localRoot } = await prepareLocalFs([ "file1.txt" ])
            const { root, actualTree, normalizeTree } = await prepareCloudFs([])
            await runMockApp({ cmd: `upload ${localRoot}/file1.txt`, root })
            expect(await actualTree()).toEqual(normalizeTree([ "file1.txt" ]))
        })
        it("should upload a file to a specified path", async () => {
            const { localRoot } = await prepareLocalFs([ "file1.txt" ])
            const { root, actualTree, normalizeTree } = await prepareCloudFs(["uploadfolder/"])
            await runMockApp({ cmd: `upload ${localRoot}/file1.txt uploadfolder/file1.txt`, root })
            expect(await actualTree()).toEqual(normalizeTree([ "uploadfolder/file1.txt" ]))
        })
        it("should upload a file to a directory", async () => {
            const { localRoot } = await prepareLocalFs([ "file1.txt" ])
            const { root, actualTree, normalizeTree } = await prepareCloudFs(["uploadfolder/"])
            await runMockApp({ cmd: `upload ${localRoot}/file1.txt uploadfolder`, root })
            expect(await actualTree()).toEqual(normalizeTree([ "uploadfolder/file1.txt" ]))
        })
    })

    describe("download", () => {
        it("should download a file to a specified path", async () => {
            const { localRoot, localActualTree, normalizeTree } = await prepareLocalFs([ "downloaddir/" ])
            const { root } = await prepareCloudFs([ "downloadfile.txt" ])
            await runMockApp({ cmd: `download downloadfile.txt ${localRoot}/downloaddir/mydownloadfile.txt`, root })
            expect(await localActualTree()).toEqual(normalizeTree([ "downloaddir/mydownloadfile.txt" ]))
        })
        it("should download a file to a directory", async () => {
            const { localRoot, localActualTree, normalizeTree } = await prepareLocalFs([ "downloaddir/" ])
            const { root } = await prepareCloudFs([ "downloadfile.txt" ])
            await runMockApp({ cmd: `download downloadfile.txt ${localRoot}/downloaddir`, root })
            expect(await localActualTree()).toEqual(normalizeTree([ "downloaddir/downloadfile.txt" ]))
        })
        it("should download a directory", async () => {
            const { localRoot, localActualTree, normalizeTree } = await prepareLocalFs([])
            const { root } = await prepareCloudFs([ "folder/file1.txt", "folder/file2.txt" ])
            await runMockApp({ cmd: `download folder/ ${localRoot}`, root })
            expect(await localActualTree()).toEqual(normalizeTree([ "folder/file1.txt", "folder/file2.txt" ]))
        })
    })

})

/**
 * Waits for 15s to allow async operations to complete.
 */
export async function waitForAsyncEndpoint() {
    return new Promise(resolve => setTimeout(resolve, 1500))
}