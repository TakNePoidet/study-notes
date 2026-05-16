const RU_TO_EN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya'
};

/** Транслит одного сегмента (без слешей) + slug-формат. */
export function slugifySegment(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((ch) => RU_TO_EN[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Slug-путь: сохраняет `/` между сегментами. */
export function slugifyPath(path: string): string {
  return path
    .split('/')
    .map(slugifySegment)
    .filter(Boolean)
    .join('/');
}
