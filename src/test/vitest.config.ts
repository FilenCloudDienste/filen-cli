import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        dir: "src/",
        testTimeout: 60000,
        hookTimeout: 60000,
        globalSetup: "./src/test/setup.ts",
    }
})