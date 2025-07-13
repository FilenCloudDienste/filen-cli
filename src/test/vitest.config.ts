import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        dir: "src/",
        testTimeout: 300000,
        hookTimeout: 300000,
        globalSetup: "./src/test/setup.ts",
    }
})