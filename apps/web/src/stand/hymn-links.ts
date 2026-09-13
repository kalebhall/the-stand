export function hymnSlug(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildHymnUrl(hymnNumber: string | null | undefined, hymnTitle: string | null | undefined): string | null {
  const number = hymnNumber?.trim();
  const title = hymnTitle?.trim();
  if (!number || !title) return null;

  const slug = hymnSlug(title);
  if (!slug) return null;

  if (/^C\d+$/i.test(number)) {
    return `https://www.churchofjesuschrist.org/study/manual/childrens-songbook/${slug}?lang=eng`;
  }

  if (/^\d+$/.test(number) && Number(number) < 1000) {
    return `https://www.churchofjesuschrist.org/study/manual/hymns/${slug}?lang=eng`;
  }

  // New-book URLs are not consistently published as study/manual pages yet.
  // Church search remains an official, usable fallback for those entries.
  return `https://www.churchofjesuschrist.org/search?lang=eng&query=${encodeURIComponent(title)}`;
}
