import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createMockApi } from "./server/mock.js";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "tabs-mock-api",
      configureServer(server) {
        server.middlewares.use("/api", createMockApi());
      },
    },
  ],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
