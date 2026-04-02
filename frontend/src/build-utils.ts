import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const frontendRoot = resolve(import.meta.dir, "..");
const distDir = resolve(frontendRoot, "dist");

export async function buildFrontend() {
  await mkdir(distDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [resolve(frontendRoot, "src", "main.ts"), resolve(frontendRoot, "src", "styles.css")],
    outdir: distDir,
    target: "browser",
    sourcemap: "external",
    minify: false,
    naming: "[name].[ext]"
  });

  if (!result.success) {
    const messages = result.logs.map((log) => log.message).join("\n");
    throw new Error(`Frontend build failed.\n${messages}`);
  }

  await Bun.write(resolve(distDir, "index.html"), buildIndexHtml());

  return {
    distDir
  };
}

function buildIndexHtml() {
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>chat-analyzer-v2 frontend</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>
`;
}
