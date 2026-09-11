import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/build-me-a-todo-app-with-categories-and-status-tracking-eb98a3/",
  build: { outDir: "dist", assetsDir: "assets" },
  server: { port: 3000 },
});
