# ГОСЫ — конспекты

Сайт с ответами к госам. Astro 5 + [Starlight](https://starlight.astro.build/) + PWA для офлайн-режима.

Контент берётся напрямую из соседней папки `../Госы-ответы/` — править нужно `.md`, сайт пересоберётся.

## Установка

```sh
pnpm install
```

## Разработка

```sh
pnpm dev
# → http://localhost:4321/study-notes/
```

В dev-режиме PWA отключена, поиск (Pagefind) работает только после `pnpm build` — индекс собирается на этапе билда.

## Сборка и предпросмотр

```sh
pnpm build
pnpm preview
```

Результат — статичный сайт в `dist/`. Чтобы проверить офлайн: открой `pnpm preview`, пройдись по нескольким страницам, выруби сеть и перезагрузи — должно работать.

## Как организован контент

Файлы лежат в `../Госы-ответы/{NN-Группа}/{NN-вопрос}.md`. Кастомный loader (`src/loaders/goses.ts`) превращает пути в slug-URL с транслитерацией:

```
Госы-ответы/01-Базы-данных/01-нормализация-баз-данных.md
                    ↓
/study-notes/01-bazy-dannyh/01-normalizatsiya-baz-dannyh
```

Что делает loader:

- `id` страницы — транслит-slug (URL остаётся латиницей).
- `filePath` — кириллический путь, по нему Starlight строит автогенерируемый сайдбар.
- Заголовок страницы (`data.title`) берётся из первого `# H1` без префикса вида `Группа 01.` или `81.`.
- `README.md` внутри группы становится индекс-страницей (`/study-notes/01-bazy-dannyh`).
- Дублирующий H1 из тела удаляется — Starlight рисует заголовок сам.

Frontmatter не требуется, но если хочется переопределить заголовок:

```yaml
---
title: "Своё название страницы"
---
```

## Деплой на GitHub Pages

Workflow уже лежит в `../.github/workflows/deploy.yml`. Что нужно один раз:

1. Создать репозиторий `study-notes` (project repo) на GitHub.
2. Запушить весь корень `Учеба/ГОСЫ/` в ветку `main`.
3. В **Settings → Pages**: **Source = Deploy from a branch**, **Branch = `gh-pages` / `(root)`**.
4. Дождаться первого прогона workflow во вкладке **Actions** — он создаст orphan-ветку `gh-pages` и зальёт туда `dist/` с `.nojekyll`.
5. Через пару минут сайт будет доступен на `https://taknepoidet.github.io/study-notes/`.

При смене имени репо нужно поправить `BASE` в `astro.config.ts` (это меняет и `base`, и PWA `scope`/`start_url`, и префикс ссылок из remark-плагина).

Если переезжаешь на свой домен — добавь файл `public/CNAME` с одной строкой (доменом) и убери `base` из конфига.

## Стек

- **Astro 5** — статика, Content Layer API
- **Starlight 0.37** — навигация, сайдбар, поиск (встроенный Pagefind), темы, локаль `ru`
- **@vite-pwa/astro** + Workbox — service worker, precache всех страниц, офлайн-fallback на `/offline`
- **Shiki** — подсветка кода (двойная тема light/dark)
- **Inter Variable** — через Google Fonts

## Структура

```
site/
├── public/                          # статика (иконки, manifest)
│   ├── favicon.svg
│   ├── pwa-192.svg
│   └── pwa-512.svg
├── src/
│   ├── components/
│   │   ├── PwaBadge.astro           # офлайн-бейдж + апдейт SW
│   │   └── overrides/Footer.astro   # Starlight Footer override
│   ├── loaders/goses.ts             # Content Layer loader для md
│   ├── pages/offline.astro          # navigateFallback PWA (без Starlight Layout)
│   ├── styles/custom.css            # брендирование Starlight
│   ├── utility/
│   │   ├── slug.ts                  # транслитерация ru → en
│   │   ├── url.ts                   # withBase() для GH Pages подпути
│   │   └── remark-md-links.ts       # [...](file.md) → /study-notes/slug
│   ├── content.config.ts            # коллекция docs со starlight schema
│   └── env.d.ts
├── astro.config.ts                  # Starlight + PWA + base /study-notes
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```
