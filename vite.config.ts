import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  build: {
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        // Lucide exports are shared between lazy pages. Without a shared chunk,
        // Rollup generates a separate HTTP request for almost every icon,
        // creating long waterfalls on high-latency connections.
        manualChunks(id) {
          if (id.includes("/node_modules/lucide-react/")) return "lucide-icons";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react({
      babel: mode === "development"
        ? { plugins: ["babel-plugin-react-dev-locator"] }
        : undefined,
    }),
  ],
}));
