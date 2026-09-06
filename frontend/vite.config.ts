import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom"], // 👈 Memaksa seluruh dependensi memakai instance React yang sama
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        cookieDomainRewrite: "",
      },
      "/sanctum": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        cookieDomainRewrite: "",
      },
      "/broadcasting": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        cookieDomainRewrite: "",
      },
    },
  },
  build: {
    sourcemap: false,
  },
});
