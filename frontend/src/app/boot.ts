import { FrontendApp } from "./frontend-app.ts";

export async function boot() {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) {
    throw new Error("Missing #app root.");
  }

  const app = new FrontendApp(root);
  await app.init();
}
