import type { ParsedCalling } from '@/src/imports/callings';
import type { ParsedMember } from '@/src/imports/membership';

const MEMBER_LIST_URL = 'https://lcr.churchofjesuschrist.org/records/member-list?lang=eng';
const CALLING_LIST_URL = 'https://lcr.churchofjesuschrist.org/mlt/report/member-callings?lang=eng';

type ScrapedTable = {
  headers: string[];
  rows: string[][];
};

export type LcrImportCredentials = {
  username: string;
  password: string;
  twoFactorCode?: string;
};

export type LcrImportData = {
  members: ParsedMember[];
  callings: ParsedCalling[];
  memberRawText: string;
  callingRawText: string;
};

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function findHeaderIndex(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

function parseSetApart(value: string): boolean {
  const normalized = normalize(value).toLowerCase();
  return normalized === 'yes' || normalized === 'true' || normalized === 'y' || normalized.includes('✔') || normalized.includes('✓');
}

function parseDateToIso(value: string): string | null {
  const normalized = normalize(value);
  if (!normalized) return null;

  const monthMap: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12'
  };

  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = normalized.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (dmy) {
    const month = monthMap[dmy[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const day = String(Number(dmy[1])).padStart(2, '0');
    return `${dmy[3]}-${month}-${day}`;
  }

  const mdy = normalized.match(/^([A-Za-z]{3,})\s+(\d{1,2})(?:,\s*|\s+)(\d{4})$/);
  if (mdy) {
    const month = monthMap[mdy[1].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const day = String(Number(mdy[2])).padStart(2, '0');
    return `${mdy[3]}-${month}-${day}`;
  }

  return null;
}

function parseAge(value: string): number | null {
  const parsed = Number.parseInt(normalize(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseMembersFromTable(table: ScrapedTable): ParsedMember[] {
  const headers = table.headers.map((header) => normalize(header).toLowerCase());
  const nameIndex = findHeaderIndex(headers, [/^name$/, /member\s*name/, /preferred\s*name/]);
  // Updated to handle 'e-mail', 'email', 'e mail'
  const emailIndex = findHeaderIndex(headers, [/e[-\s]?mail/]);
  // Updated to handle 'phone number', 'phone', 'mobile', 'cell'
  const phoneIndex = findHeaderIndex(headers, [/phone(?:\s*number)?/, /mobile/, /cell/]);
  const ageIndex = findHeaderIndex(headers, [/age/]);
  const birthdayIndex = findHeaderIndex(headers, [/birth\s*date/, /^birthday$/, /dob/]);
  const genderIndex = findHeaderIndex(headers, [/gender/, /^sex$/]);

  const deduped = new Map<string, ParsedMember>();

  for (const row of table.rows) {
    const fullName = normalize(row[nameIndex] ?? '');
    if (!fullName) continue;

    const member: ParsedMember = {
      fullName,
      email: normalize(row[emailIndex] ?? '') || null,
      phone: normalize(row[phoneIndex] ?? '') || null,
      age: parseAge(row[ageIndex] ?? ''),
      birthday: normalize(row[birthdayIndex] ?? '') || null,
      gender: normalize(row[genderIndex] ?? '') || null
    };

    deduped.set(fullName.toLowerCase(), member);
  }

  return Array.from(deduped.values());
}

function parseCallingsFromTable(table: ScrapedTable): ParsedCalling[] {
  const headers = table.headers.map((header) => normalize(header).toLowerCase());
  const nameIndex = findHeaderIndex(headers, [/^name$/, /member\s*name/]);
  const birthdayIndex = findHeaderIndex(headers, [/birth\s*date/, /^birthday$/, /dob/]);
  const organizationIndex = findHeaderIndex(headers, [/organization/]);
  const callingIndex = findHeaderIndex(headers, [/calling/]);
  const sustainedIndex = findHeaderIndex(headers, [/sustained/]);
  const setApartIndex = findHeaderIndex(headers, [/set\s*apart/]);

  const deduped = new Map<string, ParsedCalling>();

  for (const row of table.rows) {
    const memberName = normalize(row[nameIndex] ?? '');
    const birthday = normalize(row[birthdayIndex] ?? '');
    const organization = normalize(row[organizationIndex] ?? '');
    const callingName = normalize(row[callingIndex] ?? '');
    if (!memberName || !callingName) continue;

    const parsed: ParsedCalling = {
      memberName,
      birthday,
      organization,
      callingName,
      sustainedDate: parseDateToIso(row[sustainedIndex] ?? ''),
      setApart: parseSetApart(row[setApartIndex] ?? '')
    };

    deduped.set(`${memberName.toLowerCase()}::${birthday.toLowerCase()}::${callingName.toLowerCase()}`, parsed);
  }

  return Array.from(deduped.values());
}

function formatLaunchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Executable doesn't exist")) {
    return 'LCR import browser is not installed on the server. Run `npx playwright install chromium` on the deployment host.';
  }

  if (message.includes('error while loading shared libraries') || message.includes('libnspr4.so')) {
    return 'LCR import browser dependencies are missing on the server OS (for example `libnspr4`). Install Playwright system dependencies (`npx playwright install-deps chromium`) and retry.';
  }

  if (message.includes('Target page, context or browser has been closed')) {
    return 'LCR import browser failed to stay open. This is usually a server dependency issue (missing shared libs). Install OS dependencies with `npx playwright install-deps chromium` and ensure Chromium can start.';
  }

  return `Failed to start browser for LCR import: ${message}`;
}

export function parseMembersFromTableForTest(table: ScrapedTable): ParsedMember[] {
  return parseMembersFromTable(table);
}

export function parseCallingsFromTableForTest(table: ScrapedTable): ParsedCalling[] {
  return parseCallingsFromTable(table);
}

export function formatLaunchErrorForTest(error: unknown): string {
  return formatLaunchError(error);
}

async function scrapeFirstTable(page: {
  waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<unknown>;
  evaluate: <T>(pageFunction: () => T) => Promise<T>;
  url: () => string;
  title: () => Promise<string>;
}, sourceLabel: 'members' | 'callings'): Promise<ScrapedTable> {
  const candidateSelectors = [
    'table',
    '[role="table"]',
    '[role="grid"]',
    '[data-testid*="table" i]',
    '[class*="table" i]'
  ];

  let found = false;
  for (const selector of candidateSelectors) {
    const visible = await page
      .waitForSelector(selector, { timeout: 6_000 })
      .then(() => true)
      .catch(() => false);

    if (visible) {
      found = true;
      break;
    }
  }

  if (!found) {
    const title = await page.title().catch(() => 'unknown title');
    throw new Error(`Could not find a data table/grid on the ${sourceLabel} page (url: ${page.url()}, title: ${title}).`);
  }

  const extracted = await page.evaluate(() => {
    const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';

    const htmlTable = document.querySelector('table');
    if (htmlTable) {
      const headerCells = Array.from(htmlTable.querySelectorAll('thead th'));
      const rowNodes = Array.from(htmlTable.querySelectorAll('tbody tr'));

      const headers = headerCells.map((cell) => normalize(cell.textContent));
      const rows = rowNodes.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => normalize(cell.textContent)));
      if (rows.length > 0) {
        return { headers, rows };
      }
    }

    const grid = (document.querySelector('[role="grid"]') ?? document.querySelector('[role="table"]')) as HTMLElement | null;
    if (grid) {
      const headerCells = Array.from(grid.querySelectorAll('[role="columnheader"]'));
      const dataRows = Array.from(grid.querySelectorAll('[role="row"]')).filter((row) => row.querySelector('[role="gridcell"], [role="cell"]'));

      const headers = headerCells.map((cell) => normalize(cell.textContent));
      const rows = dataRows.map((row) =>
        Array.from(row.querySelectorAll('[role="gridcell"], [role="cell"]')).map((cell) => normalize(cell.textContent))
      );

      if (rows.length > 0) {
        return { headers, rows };
      }
    }

    return { headers: [], rows: [] };
  });

  if (!extracted.rows.length) {
    const title = await page.title().catch(() => 'unknown title');
    throw new Error(`Found ${sourceLabel} page container but no rows to import (url: ${page.url()}, title: ${title}).`);
  }

  return extracted;
}


type LocatorLike = {
  waitFor: (options: { state: 'visible'; timeout: number }) => Promise<void>;
  fill: (value: string) => Promise<void>;
  click: () => Promise<void>;
};

type FrameLike = {
  locator: (selector: string) => { first: () => LocatorLike };
};

type PageLike = FrameLike & {
  frames: () => FrameLike[];
  url: () => string;
};

function getPageAndFrames(page: PageLike): FrameLike[] {
  const frames = page.frames();
  return [page, ...frames];
}

async function findFirstVisibleLocator(page: PageLike, selectors: string[], timeoutMs: number): Promise<LocatorLike | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const contexts = getPageAndFrames(page);

    for (const context of contexts) {
      for (const selector of selectors) {
        const locator = context.locator(selector).first();
        const visible = await locator.waitFor({ state: 'visible', timeout: 250 }).then(() => true).catch(() => false);
        if (visible) {
          return locator;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return null;
}

async function clickFirstVisibleLocator(page: PageLike, selectors: string[], timeoutMs: number): Promise<boolean> {
  const button = await findFirstVisibleLocator(page, selectors, timeoutMs);
  if (!button) {
    return false;
  }

  await button.click();
  return true;
}

async function clickAccountChooserIfPresent(page: PageLike): Promise<void> {
  await clickFirstVisibleLocator(
    page,
    [
      'button:has-text("Use another account")',
      'a:has-text("Use another account")',
      'button:has-text("Sign in with another account")',
      'button:has-text("Use a different account")'
    ],
    5_000
  );
}


async function completeChurchAuthIfPrompted(page: PageLike, credentials: LcrImportCredentials): Promise<boolean> {
  let acted = false;

  await clickAccountChooserIfPresent(page);

  const usernameField = await findFirstVisibleLocator(
    page,
    [
      'input[type="email"]',
      'input[autocomplete="username"]',
      'input[name*="user" i]',
      'input[name*="email" i]',
      'input[id*="user" i]',
      'input[id*="identifier" i]',
      'input[id*="okta-signin-username" i]',
      'input[type="text"]'
    ],
    5_000
  );

  if (usernameField) {
    acted = true;
    await usernameField.fill(credentials.username);
    await clickFirstVisibleLocator(
      page,
      ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Next")', 'button:has-text("Continue")'],
      10_000
    );
  }

  const passwordField = await findFirstVisibleLocator(
    page,
    ['input[type="password"]', 'input[autocomplete="current-password"]', 'input[name*="pass" i]'],
    10_000
  );

  if (passwordField) {
    acted = true;
    await passwordField.fill(credentials.password);
    await clickFirstVisibleLocator(
      page,
      ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Continue")'],
      10_000
    );
  }

  const codeInput = await findFirstVisibleLocator(
    page,
    ['input[name*="code" i]', 'input[name*="otp" i]', 'input[autocomplete="one-time-code"]'],
    5_000
  );

  if (codeInput) {
    if (!credentials.twoFactorCode) {
      throw new Error('Two-factor code is required for this account.');
    }
    acted = true;
    await codeInput.fill(credentials.twoFactorCode);
    await clickFirstVisibleLocator(
      page,
      ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Verify")', 'button:has-text("Continue")'],
      10_000
    );
  }

  await clickFirstVisibleLocator(
    page,
    ['button:has-text("Continue")', 'button:has-text("Accept")', 'button:has-text("Allow")', 'button:has-text("Done")'],
    3_000
  );

  return acted;
}

export async function importFromLcr(credentials: LcrImportCredentials): Promise<LcrImportData> {
  const playwrightModule = (await import('playwright').catch(() => null)) ?? (await import('@playwright/test').catch(() => null));
  if (!playwrightModule) {
    throw new Error('LCR import is unavailable because Playwright is not installed in the server runtime.');
  }

  const { chromium } = playwrightModule;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(formatLaunchError(error));
  }

  try {
    const page = await browser.newPage();
    await page.goto(MEMBER_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const alreadySignedIn = /lcr\.churchofjesuschrist\.org/.test(page.url()) && !/id\.churchofjesuschrist\.org/.test(page.url());

    if (!alreadySignedIn) {
      const acted = await completeChurchAuthIfPrompted(page, credentials);
      if (!acted) {
        throw new Error('LCR sign-in fields were not found. The sign-in page may have changed.');
      }
      // Wait for the OAuth redirect chain to leave the Okta sign-in domain.
      // The chain is: Okta validates creds → redirects to LCR /api/auth/callback
      // → LCR sets session cookie → redirects to LCR root.
      // Using a fixed 1 s wait caused the next goto() to interrupt the callback
      // before the session cookie was set, sending the browser back to Okta.
      await page.waitForURL(
        (url) => !url.hostname.includes('id.churchofjesuschrist.org'),
        { timeout: 30_000 }
      ).catch(() => {});
      // Wait for any remaining network activity (callback → cookie → redirect).
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    }

    await page.goto(MEMBER_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });

    if (/id\.churchofjesuschrist\.org/.test(page.url())) {
      await completeChurchAuthIfPrompted(page, credentials);
      // Same URL-based wait for the retry path.
      await page.waitForURL(
        (url) => !url.hostname.includes('id.churchofjesuschrist.org'),
        { timeout: 30_000 }
      ).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.goto(MEMBER_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    }

    if (/id\.churchofjesuschrist\.org/.test(page.url())) {
      const currentTitle = await page.title().catch(() => 'unknown title');
      throw new Error(`LCR authentication is incomplete; still on sign-in domain after retry (url: ${page.url()}, title: ${currentTitle}).`);
    }

    const memberTable = await scrapeFirstTable(page, 'members');

    await page.goto(CALLING_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const callingTable = await scrapeFirstTable(page, 'callings');

    return {
      members: parseMembersFromTable(memberTable),
      callings: parseCallingsFromTable(callingTable),
      memberRawText: JSON.stringify(memberTable),
      callingRawText: JSON.stringify(callingTable)
    };
  } finally {
    await browser?.close();
  }
}
