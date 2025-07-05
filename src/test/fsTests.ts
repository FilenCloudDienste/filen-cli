import * as path from "node:path"
import * as fs from "node:fs/promises"
import { authenticatedFilenSDK, testDir, testingRootPath } from "./tests"
import { randomUUID } from "node:crypto"

// file tree

const LARGE_FILE_NAME = "1mb.txt"
const largeFileContent = () => Buffer.alloc(1024 * 1024, "a") // 1MiB of 'a' characters

type File = {
    type: "file"
    name: string
    content: string | undefined
}
export const file = (name: string, content: string | undefined = undefined): File => ({ type: "file", name, content })
export const largeFile = (): File => ({ type: "file", name: LARGE_FILE_NAME, content: "" })
type Directory = {
    type: "directory"
    name: string
    items: Tree
}
export const directory = (name: string, items: Tree = []): Directory => ({ type: "directory", name, items })
type Tree = (File | Directory | string)[]

// normalize tree (flattening directories and parsing template strings)

type NormalizedFile = { path: string, content: string | undefined }
export const UNDEFINED_FILE_CONTENT_PLACEHOLDER = "<undefined content>"
type NormalizedDirectory = { path: string }
type NormalizedTree = { files: NormalizedFile[], directories: NormalizedDirectory[] }
function normalizeTree(tree: Tree): NormalizedTree {
    const normalizeItems = (tree: Tree): ({ type: "file" | "directory" } & (NormalizedFile | NormalizedDirectory))[] => tree.flatMap(item => {
        if (typeof item === "string") {
            // parse template string ("directoryName/directoryName/fileName")
            const items: ({ type: "file" | "directory" } & (NormalizedFile | NormalizedDirectory))[] = []
            let str = item.trim()
            while (true) {
                const match = str.match(/^([^/]+)\//)
                if (match === null) break
                items.push({ type: "directory", path: match[1]! })
                str = str.substring(match[1]!.length+1).trim()
            }
            if (str.length > 0) items.push({ type: "file", path: item.trim(), content: undefined })
            return items
        } else if (item.type === "file") {
            return [{ type: "file", path: item.name, content: item.content }]
        } else {
            return [{ type: "directory", path: item.name }, ...normalizeItems(item.items)]
        }
    })
    const items = normalizeItems(tree)
    // sort and deduplicate
    const files = items.filter(i => i.type === "file").map(i => ({ path: i.path, content: (i as NormalizedFile).content }))
    const directoryPaths = new Set<string>(items.filter(i => i.type === "directory").map(i => i.path))
    return { files, directories: Array.from(directoryPaths).sort().map(path => ({ path })) }
}

// local fs

export async function prepareLocalFs(tree: Tree) {
    // create directory
    const root = path.join(testDir, "prepareLocalFs", randomUUID())
    await fs.mkdir(root, { recursive: true })
    
    // create files and directories from tree
    const { files, directories } = normalizeTree(tree)
    for (const dir of directories) {
        await fs.mkdir(path.join(root, dir.path), { recursive: true })
    }
    for (const file of files) {
        const content = file.path.endsWith(LARGE_FILE_NAME) ? largeFileContent() : Buffer.from(file.content ?? UNDEFINED_FILE_CONTENT_PLACEHOLDER)
        await fs.writeFile(path.join(root, file.path), content)
    }

    // checking function
    const readLocalFsToNormalizedTree = async (): Promise<NormalizedTree> => {
        const readDirectory = async (dir: string): Promise<NormalizedTree> => {
            const items = await fs.readdir(dir, { withFileTypes: true })
            const files: NormalizedFile[] = []
            const directories: NormalizedDirectory[] = []
            for (const item of items) {
                const itemPath = path.join(dir, item.name)
                const relativePath = itemPath.slice(root.length + "/".length).replace(/\\/g, "/")
                if (item.isDirectory()) {
                    directories.push({ path: relativePath })
                    const { files: subFiles, directories: subDirectories } = await readDirectory(itemPath)
                    files.push(...subFiles)
                    directories.push(...subDirectories)
                } else if (item.isFile()) {
                    const content = await fs.readFile(itemPath, "utf-8")
                    files.push({ path: relativePath, content: content === UNDEFINED_FILE_CONTENT_PLACEHOLDER ? undefined : content })
                }
            }
            return { files, directories }
        }
        return readDirectory(root)
    }
    return {
        localRoot: root,
        localActualTree: readLocalFsToNormalizedTree,
        normalizeTree,
    }
}

// cloud fs

export async function prepareCloudFs(tree: Tree) {
    const filen = await authenticatedFilenSDK()

    // create directory
    const root = testingRootPath.navigate("prepareCloudFs").navigate(randomUUID())
    await filen.fs().mkdir({ path: root.toString() })

    // create files and directories from tree
    const { files, directories } = normalizeTree(tree)
    const promises: Promise<unknown>[] = []
    for (const dir of directories) {
        promises.push(filen.fs().mkdir({ path: root.navigate(dir.path).toString() }))
    }
    for (const file of files) {
        const content = file.path.endsWith(LARGE_FILE_NAME) ? largeFileContent() : Buffer.from(file.content ?? UNDEFINED_FILE_CONTENT_PLACEHOLDER)
        promises.push(filen.fs().writeFile({ path: root.navigate(file.path).toString(), content }))
    }
    await Promise.all(promises)

    // checking function
    const readCloudFsToNormalizedTree = async (): Promise<NormalizedTree> => {
        const readDirectory = async (path: string): Promise<NormalizedTree> => {
            await filen.fs().readdir({ path })
            const items = Object.entries(filen.fs()._items).filter(([cachedPath]) => cachedPath.startsWith(path) && cachedPath !== path)
            const files: NormalizedFile[] = []
            const directories: NormalizedDirectory[] = []
            for (const [cachedPath, item] of items) {
                const relativePath = cachedPath.slice(path.length + "/".length)
                if (item.type === "directory") {
                    directories.push({ path: relativePath })
                } else if (item.type === "file") {
                    const content = (await filen.fs().readFile({ path: root.navigate(relativePath).toString() })).toString()
                    files.push({ path: relativePath, content: content === UNDEFINED_FILE_CONTENT_PLACEHOLDER ? undefined : content })
                }
            }
            return { files, directories }
        }
        return readDirectory(root.toString())
    }
    return {
        root,
        actualTree: () => readCloudFsToNormalizedTree(),
        normalizeTree,
    }
}