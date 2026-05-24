import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import AstroPWA from '@vite-pwa/astro';

const BASE = '/study-notes';
const BASE_SLASH = `${BASE}/`;

/** Группы ответов: кириллическая папка (= filePath) → русское название в сайдбаре. */
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

export default defineConfig({
  output: 'static',
  trailingSlash: 'never',
  site: process.env.PUBLIC_SITE ?? 'https://USERNAME.github.io',
  base: BASE,
  integrations: [
    starlight({
      title: 'ГОСЫ',
      description: 'Офлайн-конспекты ответов к госэкзамену.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Русский', lang: 'ru' },
      },
      // Код подсвечивает Astro/Shiki (наш лоадер), Expressive Code не нужен.
      expressiveCode: false,
      customCss: ['./src/styles/custom.css'],
      head: [
        { tag: 'meta', attrs: { name: 'theme-color', content: '#5fc02e' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap',
          },
        },
      ],
      components: {
        // Возвращаем PWA-бейдж (офлайн-статус + обновление SW).
        Footer: './src/components/overrides/Footer.astro',
      },
      pagination: true,
      sidebar: [
        {
          label: 'Скачать всё одним PDF',
          link: '/gosy.pdf',
          attrs: { download: '', target: '_blank', rel: 'noopener' },
          badge: { text: 'PDF', variant: 'success' },
        },
        ...GROUPS.map(([dir, label]) => ({
          label,
          autogenerate: { directory: dir },
        })),
      ],
    }),
    AstroPWA({
      registerType: 'autoUpdate',
      base: BASE_SLASH,
      scope: BASE_SLASH,
      includeAssets: ['favicon.svg', 'pwa-192.svg', 'pwa-512.svg'],
      manifest: {
        name: 'ГОСЫ — конспекты',
        short_name: 'ГОСЫ',
        description: 'Офлайн-конспекты ответов к госам',
        lang: 'ru',
        theme_color: '#5fc02e',
        background_color: '#0e0e10',
        display: 'standalone',
        start_url: BASE_SLASH,
        scope: BASE_SLASH,
        icons: [
          { src: `${BASE_SLASH}pwa-192.svg`, sizes: '192x192', type: 'image/svg+xml' },
          { src: `${BASE_SLASH}pwa-512.svg`, sizes: '512x512', type: 'image/svg+xml' },
          { src: `${BASE_SLASH}pwa-512.svg`, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Прекешируем ВСЁ за один заход: все страницы + полный индекс
        // поиска Pagefind (pf_meta/pf_index/pf_fragment/wasm .pagefind).
        globPatterns: [
          '**/*.{html,css,js,svg,woff2,woff,json,webmanifest,pf_meta,pf_index,pf_fragment,pagefind,pdf}',
        ],
        navigateFallback: `${BASE}/offline`,
        navigateFallbackDenylist: [new RegExp(`^${BASE}/pagefind/`)],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Подхватываем управление сразу, чтоб первый офлайн работал без перезагрузки.
        clientsClaim: true,
        skipWaiting: true,
        // Удаляем кеши старых сборок, чтобы не зависнуть на устаревшем SW.
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${BASE}/pagefind/`),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pagefind',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      },
      experimental: { directoryAndTrailingSlashHandler: true }
    })
  ],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true
    }
  },
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
});
