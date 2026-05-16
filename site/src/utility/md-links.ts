import { dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugifyPath } from './slug';

/** Корень исходных ответов (та же папка, что и у лоадера). */
const CONTENT_ROOT = fileURLToPath(new URL('../../../Госы-ответы', import.meta.url)).split('\\').join('/');

const EXTERNAL = /^(?:[a-z]+:|\/\/|#|mailto:|tel:)/i;

/**
 * Превращает локальную `.md`-ссылку (относительно исходного файла) в URL сайта.
 * Возвращает `null`, если ссылку трогать не нужно.
 */
export function resolveMdLink(fromFileAbs: string, url: string, base: string): string | null {
  if (!url || EXTERNAL.test(url) || url.startsWith('/')) return null;

  const cut = url.search(/[#?]/);
  const rawPath = cut === -1 ? url : url.slice(0, cut);
  const tail = cut === -1 ? '' : url.slice(cut);
  if (!/\.md$/i.test(rawPath)) return null;

  const fromDir = dirname(fromFileAbs).split('\\').join('/');
  const absolute = posix.resolve(fromDir, decodeURIComponent(rawPath));
  const relative = posix.relative(CONTENT_ROOT, absolute);
  if (relative.startsWith('..')) return null;

  const cleaned = relative.replace(/\.md$/i, '').replace(/\/README$/i, '');
  const id = cleaned === '' || cleaned.toLowerCase() === 'readme' ? '' : slugifyPath(cleaned);

  const normBase = base.endsWith('/') ? base : `${base}/`;
  return normBase + id + tail;
}

/**
 * Переписывает все инлайновые `[..](file.md)` ссылки в markdown-строке.
 * Используется в лоадере до рендера, т.к. путь исходника там известен
 * (remark-плагин его не видит при `context.renderMarkdown`).
 */
export function rewriteMdLinks(markdown: string, fromFileAbs: string, base: string): string {
  return markdown.replace(/(\]\()([^)\s]+)(\))/g, (match, open, url, close) => {
    const resolved = resolveMdLink(fromFileAbs, url, base);
    return resolved === null ? match : `${open}${resolved}${close}`;
  });
}
