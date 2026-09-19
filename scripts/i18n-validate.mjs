#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@formatjs/icu-messageformat-parser';

const messagesDir = path.resolve('apps/web/messages');
const sourceLocale = 'en-US';
const sourcePath = path.join(messagesDir, `${sourceLocale}.json`);

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

function readCatalog(fileName) {
  const filePath = path.join(messagesDir, fileName);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const source = flatten(readCatalog(`${sourceLocale}.json`));
const errors = [];

for (const fileName of fs
  .readdirSync(messagesDir)
  .filter((name) => name.endsWith('.json'))
  .sort()) {
  const locale = fileName.slice(0, -'.json'.length);
  const catalog = flatten(readCatalog(fileName));
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

console.log(
  `Validated ${source.size} message keys across ${fs.readdirSync(messagesDir).filter((name) => name.endsWith('.json')).length} locale catalogs.`
);
