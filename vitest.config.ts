import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "build/**", "dist/**"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "server/app.ts",
        "server/config.ts",
        "server/database.ts",
        "server/rpc.ts",
        "server/routes/{auth,files}.ts",
        "server/lib/{password,document-extractor,docx-structured-text}.ts",
        "src/lib/{document-block-parser,extract-text-renderer}.ts",
        "src/services/{api,auth}.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 75,
      },
    },
  },
});
