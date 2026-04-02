import { resolve } from "node:path";
import { buildFrontend } from "./build-utils.ts";

const { distDir } = await buildFrontend();

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
