/** Префиксит путь base'ом сайта (для GitHub Pages с подпутём `/repo-name/`). */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL; // всегда заканчивается на `/`
  if (path === '' || path === '/') return base;
  const stripped = path.startsWith('/') ? path.slice(1) : path;
  return base + stripped;
}
