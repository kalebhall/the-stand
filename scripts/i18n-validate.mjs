#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@formatjs/icu-messageformat-parser';

const messagesDir = path.resolve('apps/web/messages');
const sourceLocale = 'en-US';

function flatten(value, prefix = '', output = new Map()) {
  if (typeof value === 'string') {
    output.set(prefix, value);
    return output;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Message value at ${prefix || '<root>'} must be an object or string`);
  }

  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function readCatalog(locale, moduleName) {
  const filePath = path.join(messagesDir, locale, `${moduleName}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function localeCatalog(locale) {
  const localeDir = path.join(messagesDir, locale);
  return Object.assign(
    {},
    ...fs
      .readdirSync(localeDir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => readCatalog(locale, name.slice(0, -'.json'.length)))
  );
}

const locales = fs
  .readdirSync(messagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const source = flatten(localeCatalog(sourceLocale));
const errors = [];

for (const locale of locales) {
  const catalog = flatten(localeCatalog(locale));
  const missing = [...source.keys()].filter((key) => !catalog.has(key));
  const extra = [...catalog.keys()].filter((key) => !source.has(key));

  if (missing.length) errors.push(`${locale}: missing keys: ${missing.join(', ')}`);
  if (extra.length) errors.push(`${locale}: extra keys: ${extra.join(', ')}`);

  for (const [key, message] of catalog) {
    try {
      parse(message);
    } catch (error) {
      errors.push(`${locale}.${key}: invalid ICU message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${source.size} message keys across ${locales.length} locale catalogs.`);
