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

function parseBoolean(value: string): boolean {
  const normalized = normalize(value).toLowerCase();
  return normalized === 'yes' || normalized === 'true' || normalized === 'y' || normalized.includes('✔') || normalized.includes('✓');
}

function parseAge(value: string): number | null {
  const parsed = Number.parseInt(normalize(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseMembersFromTable(table: ScrapedTable): ParsedMember[] {
  const headers = table.headers.map((header) => normalize(header).toLowerCase());
  const nameIndex = findHeaderIndex(headers, [/^name$/, /member\s*name/, /preferred\s*name/]);
  const emailIndex = findHeaderIndex(headers, [/email/]);
  const phoneIndex = findHeaderIndex(headers, [/phone/, /mobile/, /cell/]);
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
      sustained: parseBoolean(row[sustainedIndex] ?? ''),
      setApart: parseBoolean(row[setApartIndex] ?? '')
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
}): Promise<ScrapedTable> {
  await page.waitForSelector('table', { timeout: 30_000 });

  return page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) {
      return { headers: [], rows: [] };
    }

    const headerCells = Array.from(table.querySelectorAll('thead th'));
    const rowNodes = Array.from(table.querySelectorAll('tbody tr'));

    return {
      headers: headerCells.map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
      rows: rowNodes.map((row) =>
        Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      )
    };
  });
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
      let usernameField = await findFirstVisibleLocator(
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
        12_000
      );

      if (!usernameField) {
        await clickAccountChooserIfPresent(page);
        usernameField = await findFirstVisibleLocator(
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
          20_000
        );
      }

      if (!usernameField) {
        throw new Error('LCR sign-in username field was not found. The sign-in page may have changed.');
      }

      await usernameField.fill(credentials.username);

    const advancedToPassword = await clickFirstVisibleLocator(
      page,
      ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Next")', 'button:has-text("Continue")'],
      15_000
    );

    if (!advancedToPassword) {
      throw new Error('LCR sign-in submit button was not found after entering username.');
    }

    const passwordField = await findFirstVisibleLocator(
      page,
      ['input[type="password"]', 'input[autocomplete="current-password"]', 'input[name*="pass" i]'],
      30_000
    );

    if (!passwordField) {
      throw new Error('LCR sign-in password field did not appear after submitting username.');
    }

    await passwordField.fill(credentials.password);

    const submittedPassword = await clickFirstVisibleLocator(
      page,
      ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Continue")'],
      15_000
    );

    if (!submittedPassword) {
      throw new Error('LCR sign-in submit button was not found after entering password.');
    }

      const codeInput = await findFirstVisibleLocator(
        page,
        ['input[name*="code" i]', 'input[name*="otp" i]', 'input[autocomplete="one-time-code"]'],
        10_000
      );

      if (codeInput) {
        if (!credentials.twoFactorCode) {
          throw new Error('Two-factor code is required for this account.');
        }
        await codeInput.fill(credentials.twoFactorCode);

        await clickFirstVisibleLocator(
          page,
          ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Verify")', 'button:has-text("Continue")'],
          10_000
        );
      }

      // Don't require auth flow to land on a specific post-login URL.
      // Once credentials/2FA are submitted, navigate directly to each import URL.
      await page.waitForTimeout(1000);
    }

    await page.goto(MEMBER_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    const memberTable = await scrapeFirstTable(page);

    await page.goto(CALLING_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const callingTable = await scrapeFirstTable(page);

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
