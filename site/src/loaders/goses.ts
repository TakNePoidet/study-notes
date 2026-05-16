import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';
import { slugifyPath, slugifySegment } from '../utility/slug';
import { rewriteMdLinks } from '../utility/md-links';

/** Папка с исходными ответами лежит рядом с проектом сайта. */
const CONTENT_ROOT = fileURLToPath(new URL('../../../Госы-ответы', import.meta.url));

/** «Группа 01. », «81. », «1) » → срезаем порядковый префикс из заголовка. */
const TITLE_PREFIX = /^\s*(?:Группа\s+)?\d+\s*[.)]?\s*/i;
/** Любой ведущий мусор перед первым H1 (на случай frontmatter в исходниках). */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
/** Первый H1 markdown-документа. */
const FIRST_H1 = /^\s{0,3}#\s+(.+?)\s*#*\s*$/m;

function deriveTitle(body: string, fallback: string): string {
  const text = (body.match(FIRST_H1)?.[1] ?? fallback).trim();
  const cleaned = text.replace(TITLE_PREFIX, '').trim();
  return cleaned || text || fallback;
}

/** Заголовок страницы рисует Starlight — убираем дублирующий H1 из тела. */
function stripFirstH1(body: string): string {
  return body.replace(/^\s{0,3}#\s+.+(?:\r?\n)+/m, '');
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) found.push(...(await walkMarkdown(full)));
    else if (item.isFile() && item.name.toLowerCase().endsWith('.md')) found.push(full);
  }
  return found;
}

/**
 * Кастомный Content-Layer лоадер для коллекции `docs` Starlight.
 *
 * Зачем кастомный: исходники без frontmatter, названия — кириллицей в H1.
 *  - `id`        → транслит-slug (URL остаётся латиницей, как было до миграции);
 *  - `filePath`  → исходный кириллический путь (по нему Starlight строит
 *                  автогенерируемый сайдбар и порядок);
 *  - `data.title`→ из H1 без «Группа NN.» / «NN.»;
 *  - README папки → индекс группы (`<dir>/index.md`, order 0).
 */
export function gosesLoader(): Loader {
  return {
    name: 'goses-loader',
    async load({ store, parseData, renderMarkdown, generateDigest, logger, config }) {
      const base = config.base ?? '/';
      store.clear();
      const files = await walkMarkdown(CONTENT_ROOT);

      for (const file of files) {
        const rel = relative(CONTENT_ROOT, file).split(sep).join('/');
        const cleaned = rel.replace(/\.md$/i, '').replace(/\/README$/i, '');
        const isRoot = cleaned === '' || cleaned.toLowerCase() === 'readme';
        const segments = cleaned.split('/');
        const isGroupIndex = !isRoot && segments.length === 1;

        // URL-slug — латиница, как раньше. Корневой README → 'index',
        // Starlight нормализует это в '' → главная страница '/'.
        const id = isRoot ? 'index' : slugifyPath(cleaned);

        // filePath сохраняем кириллическим, индексы папок → <dir>/index.md,
        // чтобы Starlight распознал их как корень группы в autogenerate.
        const filePath = isRoot
          ? 'index.md'
          : isGroupIndex
            ? `${segments[0]}/index.md`
            : rel;

        const rawAll = await readFile(file, 'utf8');
        // Переписываем `[..](file.md)` здесь: путь исходника известен,
        // а remark-плагин его не видит при context.renderMarkdown.
        const raw = rewriteMdLinks(rawAll.replace(FRONTMATTER, ''), file, base);

        const lastSegment = segments[segments.length - 1] ?? cleaned;
        const numberPrefix = lastSegment.match(/^(\d+)/)?.[1];
        // README группы показываем первым (order 0); вопросы — по номеру файла.
        const order = isRoot || isGroupIndex ? 0 : Number(numberPrefix ?? Number.MAX_SAFE_INTEGER);

        const title = isRoot
          ? 'Прикладная информатика'
          : deriveTitle(raw, slugifySegment(lastSegment) || 'Без названия');
        const body = stripFirstH1(raw).trim();
        const rendered = await renderMarkdown(body);

        const data = await parseData({
          id,
          data: { title, sidebar: { order } },
        });

        store.set({ id, data, body, filePath, rendered, digest: generateDigest(rawAll) });
      }

      logger.info(`загружено ответов: ${files.length}`);
    },
  };
}
