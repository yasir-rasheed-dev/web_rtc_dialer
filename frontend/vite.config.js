import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3100",
      "/socket.io": { target: "http://127.0.0.1:3100", ws: true }
    }
  },
  build: {
    sourcemap: false,
    target: "es2020"
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js"
  }
});
