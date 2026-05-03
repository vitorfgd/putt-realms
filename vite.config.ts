import { defineConfig } from "vite";

function viteBase(): string {
  const override = process.env.VITE_BASE_PATH?.trim();
  if (override) {
    return override.endsWith("/") ? override : `${override}/`;
  }
  if (process.env.GITHUB_ACTIONS === "true") {
    const repo = process.env.GITHUB_REPOSITORY ?? "";
    const name = repo.split("/")[1] || "putt-realms";
    return `/${name}/`;
  }
  return "/";
}

/**
 * GitHub Pages: `https://<user>.github.io/<repo>/` — base is `/<repo>/`
 * when built in Actions (`GITHUB_REPOSITORY`). Override with `VITE_BASE_PATH`.
 */
export default defineConfig({
  base: viteBase(),
  root: ".",
  server: {
    host: true,
  },
});
