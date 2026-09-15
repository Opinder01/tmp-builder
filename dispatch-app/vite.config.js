import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on all interfaces so a phone on the same WiFi can reach it
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
