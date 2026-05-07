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
 * GitHub Pages project URL: `https://<user>.github.io/<repo>/` needs `base: /<repo>/`.
 * The workflow sets `VITE_BASE_PATH`; otherwise Actions uses `GITHUB_REPOSITORY`.
 */
export default defineConfig({
  base: viteBase(),
  root: ".",
  server: {
    host: true,
  },
});
