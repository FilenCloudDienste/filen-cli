import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        dir: "src/",
        testTimeout: 300_000,
        hookTimeout: 300_000,
        globalSetup: "./src/test/setup.ts",
    }
})