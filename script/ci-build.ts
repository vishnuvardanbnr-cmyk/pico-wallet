import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";
import { rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function ciBuild() {
  console.log("CI Build: Building for Capacitor Android...");
  
  await rm(path.join(rootDir, "dist"), { recursive: true, force: true });

  console.log("Building client with Vite...");
  
  await viteBuild({
    plugins: [react()],
    root: path.resolve(rootDir, "client"),
    base: "./",
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "client", "src"),
        "@shared": path.resolve(rootDir, "shared"),
        "@assets": path.resolve(rootDir, "attached_assets"),
      },
    },
    build: {
      outDir: path.resolve(rootDir, "dist", "public"),
      emptyOutDir: true,
    },
  });
  
  console.log("Client build complete!");
}

ciBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
