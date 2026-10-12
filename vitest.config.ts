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
      // Vitest 5 counts AST statements, functions and branches separately;
      // Vitest 3 counted statements identically to lines. Retain the 90% line
      // floor and baseline the other metrics against the new V8 accounting.
      thresholds: {
        lines: 90,
        functions: 88,
        statements: 86,
        branches: 74,
      },
    },
  },
});
