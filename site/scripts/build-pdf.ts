/**
 * Собирает все ответы в один PDF с закладками-оглавлением и кликабельными
 * внутренними ссылками. Запуск: `pnpm pdf`. Результат: public/gosy.pdf,
 * который автоматически попадает в `dist` при следующем `pnpm build`.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import puppeteer from 'puppeteer';
import { slugifyPath, slugifySegment } from '../src/utility/slug';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = join(HERE, '..', '..', 'Госы-ответы');
const OUT_PATH = join(HERE, '..', 'public', 'gosy.pdf');

/** Темы в порядке для оглавления — берём из astro.config (синхронизировано вручную). */
const GROUPS: Array<[dir: string, label: string]> = [
  ['01-Базы-данных', 'Базы данных и СУБД'],
  ['02-Веб-технологии', 'Веб-технологии и JavaScript'],
  ['03-Мобильная-разработка', 'Мобильная разработка и UI/UX'],
  ['04-Проектирование-ПО', 'Проектирование ПО и методологии'],
  ['05-Электронный-бизнес', 'Электронный бизнес и веб-аналитика'],
  ['06-Защита-информации', 'Защита информации'],
  ['07-Большие-данные', 'Большие данные (Hadoop / MapReduce)'],
  ['08-Операционные-системы', 'Операционные системы'],
  ['09-Архитектура-ЭВМ', 'Архитектура ЭВМ и память'],
  ['10-Блокчейн', 'Блокчейн и смарт-контракты'],
  ['11-Управление-проектами', 'Управление проектами'],
  ['12-Бизнес-модели-стартапы', 'Бизнес-модели, стартапы, инновации'],
  ['13-Бенчмаркинг', 'Бенчмаркинг'],
  ['14-Цифровая-экономика', 'Цифровая экономика'],
  ['15-Корпоративные-ИС', 'Корпоративные ИС (ERP/MRP/CSRP)'],
  ['16-Бизнес-анализ', 'Бизнес-анализ'],
];

const TITLE_PREFIX = /^\s*(?:Группа\s+)?\d+\s*[.)]?\s*/i;
const FIRST_H1 = /^\s{0,3}#\s+(.+?)\s*#*\s*$/m;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const EXTERNAL = /^(?:[a-z]+:|\/\/|#|mailto:|tel:)/i;

const flatId = (slug: string) => slug.replace(/\//g, '--');

function deriveTitle(body: string, fallback: string): string {
  const text = (body.match(FIRST_H1)?.[1] ?? fallback).trim();
  return text.replace(TITLE_PREFIX, '').trim() || fallback;
}

function stripFirstH1(body: string): string {
  return body.replace(/^\s{0,3}#\s+.+(?:\r?\n)+/m, '');
}

/** Переписываем `[..](file.md)` в якорные ссылки `#<flat-slug>`. */
function rewriteMdLinksToAnchors(markdown: string, fromFileAbs: string): string {
  const contentRootPosix = CONTENT_ROOT.split('\\').join('/');
  const fromDir = dirname(fromFileAbs).split('\\').join('/');
  return markdown.replace(/(\]\()([^)\s]+)(\))/g, (match, open, url, close) => {
    if (!url || EXTERNAL.test(url) || url.startsWith('/')) return match;
    const cut = url.search(/[#?]/);
    const rawPath = cut === -1 ? url : url.slice(0, cut);
    if (!/\.md$/i.test(rawPath)) return match;
    const absolute = posix.resolve(fromDir, decodeURIComponent(rawPath));
    const rel = posix.relative(contentRootPosix, absolute);
    if (rel.startsWith('..')) return match;
    const cleaned = rel.replace(/\.md$/i, '').replace(/\/README$/i, '');
    const slug =
      cleaned === '' || cleaned.toLowerCase() === 'readme' ? 'root' : flatId(slugifyPath(cleaned));
    return `${open}#${slug}${close}`;
  });
}

/** Внутри тела ответа сдвигаем `h1..h3` вниз, чтобы outline PDF был только: Тема → Вопрос. */
function bumpHeadings(html: string): string {
  return html
    .replace(/<(\/?)h3(\b[^>]*)>/g, '<$1h5$2>')
    .replace(/<(\/?)h2(\b[^>]*)>/g, '<$1h4$2>')
    .replace(/<(\/?)h1(\b[^>]*)>/g, '<$1h3$2>');
}

async function walkMd(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) out.push(...(await walkMd(full)));
    else if (item.isFile() && item.name.toLowerCase().endsWith('.md')) out.push(full);
  }
  return out;
}

interface Entry {
  group: string;
  isRoot: boolean;
  isGroupIndex: boolean;
  order: number;
  title: string;
  htmlBody: string;
  flatId: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function buildHtml(): Promise<string> {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  const files = await walkMd(CONTENT_ROOT);
  const entries: Entry[] = [];

  for (const file of files) {
    const rel = relative(CONTENT_ROOT, file).split(sep).join('/');
    const cleaned = rel.replace(/\.md$/i, '').replace(/\/README$/i, '');
    const isRoot = cleaned === '' || cleaned.toLowerCase() === 'readme';
    const segments = cleaned.split('/');
    const isGroupIndex = !isRoot && segments.length === 1;

    const raw0 = (await readFile(file, 'utf8')).replace(FRONTMATTER, '');
    const raw = rewriteMdLinksToAnchors(raw0, file);
    const last = segments[segments.length - 1] ?? cleaned;
    const title = isRoot ? 'Прикладная информатика' : deriveTitle(raw, last);
    const body = stripFirstH1(raw).trim();
    const html = bumpHeadings(md.render(body));

    entries.push({
      group: isRoot ? '' : segments[0]!,
      isRoot,
      isGroupIndex,
      order: Number((last.match(/^(\d+)/) ?? ['', '9999'])[1]),
      title,
      htmlBody: html,
      flatId: isRoot ? 'root' : flatId(slugifyPath(cleaned)),
    });
  }

  const groups = GROUPS.map(([dir, label]) => ({
    dir,
    label,
    slug: flatId(slugifyPath(dir)),
    indexEntry: entries.find((e) => e.group === dir && e.isGroupIndex),
    questions: entries
      .filter((e) => e.group === dir && !e.isGroupIndex)
      .sort((a, b) => a.order - b.order),
  }));

  const totalQuestions = groups.reduce((n, g) => n + g.questions.length, 0);

  const tocHtml = `
    <h1 class="toc-title">Оглавление</h1>
    <ol class="toc-list">
      ${groups
        .map(
          (g) => `
        <li class="toc-group">
          <a href="#${g.slug}"><span class="toc-num">${g.dir.slice(0, 2)}</span> ${escapeHtml(g.label)}</a>
          <ol>
            ${g.questions
              .map((q) => `<li><a href="#${q.flatId}">${escapeHtml(q.title)}</a></li>`)
              .join('')}
          </ol>
        </li>`,
        )
        .join('')}
    </ol>`;

  const bodyHtml = groups
    .map(
      (g) => `
    <section class="group" id="${g.slug}">
      <h1 class="group-heading">${escapeHtml(g.label)}</h1>
      ${g.indexEntry ? `<div class="group-intro">${g.indexEntry.htmlBody}</div>` : ''}
      ${g.questions
        .map(
          (q) => `
        <section class="question" id="${q.flatId}">
          <h2 class="question-heading">${escapeHtml(q.title)}</h2>
          ${q.htmlBody}
        </section>`,
        )
        .join('')}
    </section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>ГОСЫ — конспекты</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm; }
  html { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #18181b; }
  body { margin: 0; }
  a { color: #2f6c14; text-decoration: none; }

  .cover { height: calc(100vh - 40mm); display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
  .cover .brand { font-size: 56pt; font-weight: 800; letter-spacing: -0.02em; color: #4ca524; margin: 0; }
  .cover .sub { font-size: 14pt; color: #18181b; margin-top: 0.6em; }
  .cover .meta { font-size: 11pt; color: #71717a; margin-top: 1.4em; }

  .toc { page-break-after: always; }
  .toc-title { font-size: 22pt; margin: 0 0 0.6em; }
  .toc-list { list-style: none; padding: 0; counter-reset: none; }
  .toc-list ol { list-style: none; padding-left: 1.2em; }
  .toc-group > a { font-weight: 700; font-size: 12pt; color: #18181b; display: block; margin-top: 0.6em; }
  .toc-num { display: inline-block; min-width: 1.6em; color: #71717a; font-variant-numeric: tabular-nums; }
  .toc li a { color: #18181b; }
  .toc-list > .toc-group > ol > li { margin: 0.15em 0; font-size: 10pt; }

  .group { page-break-before: always; }
  .group-heading { font-size: 22pt; margin: 0 0 0.6em; color: #2f6c14; }
  .group-intro { color: #3f3f46; }

  .question { page-break-before: always; }
  .question-heading { font-size: 15pt; margin: 0 0 0.5em; line-height: 1.3; }

  h3 { font-size: 12pt; margin: 1em 0 0.3em; }
  h4 { font-size: 11pt; margin: 0.9em 0 0.25em; color: #3f3f46; }
  h5 { font-size: 10.5pt; margin: 0.8em 0 0.2em; color: #52525b; }

  p { margin: 0 0 0.5em; }
  ul, ol { margin: 0 0 0.5em; padding-left: 1.4em; }
  li { margin: 0.1em 0; }
  blockquote { border-left: 3px solid #5fc02e; padding: 0.1em 0 0.1em 0.8em; color: #52525b; margin: 0.6em 0; }
  hr { border: 0; border-top: 1px solid #d4d4d8; margin: 1em 0; }
  pre, code { font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace; }
  code { background: #f4f4f5; padding: 0.05em 0.35em; border-radius: 3px; font-size: 0.92em; }
  pre { background: #f4f4f5; padding: 0.7em 0.9em; border-radius: 5px; font-size: 9pt; white-space: pre-wrap; word-break: break-word; }
  pre code { background: transparent; padding: 0; font-size: inherit; }
  table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 0.5em 0; }
  th, td { border: 1px solid #d4d4d8; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>

<section class="cover">
  <p class="brand">ГОСЫ</p>
  <p class="sub">Конспекты ответов к госэкзамену</p>
  <p class="meta">09.03.03 Прикладная информатика<br>${totalQuestions} вопросов · ${groups.length} тем</p>
</section>

<section class="toc">${tocHtml}</section>

${bodyHtml}

</body>
</html>`;
}

async function main(): Promise<void> {
  console.log('▸ собираем HTML…');
  const html = await buildHtml();
  await mkdir(dirname(OUT_PATH), { recursive: true });
  // На всякий случай — кладём рядом исходный HTML для отладки.
  await writeFile(OUT_PATH.replace(/\.pdf$/, '.debug.html'), html, 'utf8');

  console.log('▸ запускаем headless Chrome…');
  const browser = await puppeteer.launch({
    headless: true,
    // --no-sandbox нужен под CI ubuntu (GitHub Actions).
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMediaType('print');

    console.log('▸ печатаем в PDF…');
    await page.pdf({
      path: OUT_PATH,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '16mm', bottom: '22mm', left: '16mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="font-size:9px;color:#71717a;width:100%;text-align:center;padding:0 12mm;">ГОСЫ — конспекты &nbsp;·&nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      // Закладки = outline. Headings → дерево закладок в читалке.
      outline: true,
      tagged: true,
    });
  } finally {
    await browser.close();
  }

  console.log('✓ PDF готов:', OUT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
