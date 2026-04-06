import { watch } from "node:fs";
import { resolve } from "node:path";
import { buildFrontend } from "./build-utils.ts";

const srcDir = resolve(import.meta.dir);
const { distDir } = await buildFrontend();

let rebuildChain = Promise.resolve();
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

const watcher = watch(srcDir, { recursive: true }, (_eventType, filename) => {
  const changedFile = typeof filename === "string" ? filename : "";
  if (!changedFile || changedFile.includes(`${resolve(import.meta.dir, "..", "dist")}`)) {
    return;
  }

  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }

  rebuildTimer = setTimeout(() => {
    rebuildChain = rebuildChain
      .then(async () => {
        console.log(`Rebuilding frontend after change: ${changedFile}`);
        await buildFrontend();
      })
      .catch((error) => {
        console.error("Frontend rebuild failed:");
        console.error(error);
      });
  }, 75);
});

const server = Bun.serve({
  port: 5173,
  development: true,
  async fetch(request) {
    const url = new URL(request.url);
    const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = Bun.file(resolve(distDir, relativePath));

    if (await file.exists()) {
      return new Response(file);
    }

    if (!relativePath.includes(".")) {
      return new Response(Bun.file(resolve(distDir, "index.html")));
    }

    return new Response("Not found", { status: 404 });
  }
});

console.log(`Frontend listening at http://localhost:${server.port}`);

process.on("SIGINT", () => {
  watcher.close();
  server.stop(true);
  process.exit(0);
});
