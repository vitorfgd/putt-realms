/**
 * URLs under Vite `public/` must respect {@link import.meta.env.BASE_URL}
 * (e.g. GitHub Pages at `https://user.github.io/repo-name/`).
 */
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  const trimmed = path.replace(/^\/+/, "");
  return `${base}${trimmed}`;
}
