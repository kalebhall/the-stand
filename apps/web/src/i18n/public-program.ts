import enUS from '../../messages/en-US.json';
import es from '../../messages/es.json';
import { resolveLocale, type Locale } from './config';

type PublicProgramMessages = {
  publicProgram: {
    title: string;
    body: string;
  };
};

const messages: Record<Locale, PublicProgramMessages> = {
  'en-US': enUS,
  es
};

export function resolvePublicLocale(cookieLocale: string | null | undefined): Locale {
  return resolveLocale(cookieLocale);
}

export function buildPublicProgramEmptyHtml(locale: Locale): string {
  const copy = messages[locale].publicProgram;
  return `<main class="public-program mx-auto max-w-3xl space-y-2 p-4 sm:p-8" aria-labelledby="public-program-title"><h1 id="public-program-title" class="text-2xl font-semibold">${copy.title}</h1><p class="text-sm text-muted-foreground">${copy.body}</p></main>`;
}
