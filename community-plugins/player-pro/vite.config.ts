import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "src/entry.ts"),
      name: "AniriumPlayerProAddon",
      formats: ["iife"],
      fileName: () => "player-pro.js",
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "window.__ANIRIUM_HOST_RUNTIME__.React",
          "react-dom": "window.__ANIRIUM_HOST_RUNTIME__.ReactDOM",
        },
      },
    },
  },
});
