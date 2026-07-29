import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { parseAtomFeed } from '../../src/lib/atom.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

test('performance - parses all phase0 fixtures within 55s', async (t) => {
  const startTime = Date.now();

  const fixtures = [
    'test/fixtures/extra_l.xml',
    'test/fixtures/eqvol_l.xml',
    'test/fixtures/other_l.xml',
    'test/fixtures/regular_l.xml',
  ];

  for (const fixture of fixtures) {
    const xml = await fs.readFile(fixture, 'utf-8');
    const doc = parser.parse(xml);
    const feedData = parseAtomFeed(doc);
    assert(feedData.entries.length > 0);
  }

  const elapsed = Date.now() - startTime;
  console.log(`Parsed all fixtures in ${elapsed}ms`);
  assert(elapsed < 55000, `Performance: ${elapsed}ms should be < 55000ms`);
});
