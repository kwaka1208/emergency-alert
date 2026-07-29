import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { parseReport, parseInformation, buildStateEntry } from '../../src/lib/report.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

test('parseReport - extracts head information', async () => {
  const xml = await fs.readFile('test/fixtures/reports/keiho_niigata_samestate_1.xml', 'utf-8');
  const doc = parser.parse(xml);
  const report = parseReport(doc);

  assert(report.title);
  assert(report.reportDateTime);
  assert(report.infoType);
  assert.strictEqual(report.infoType, '発表');
});

test('parseReport - parses information items', async () => {
  const xml = await fs.readFile('test/fixtures/reports/keiho_niigata_samestate_1.xml', 'utf-8');
  const doc = parser.parse(xml);
  const report = parseReport(doc);

  assert(Array.isArray(report.information));
  assert(report.information.length > 0);
  assert(report.information[0].areaCode);
  assert(report.information[0].kindName);
});

test('parseReport - handles tsunami information', async () => {
  const xml = await fs.readFile('test/fixtures/reports/tsunami_keiho_serial_a.xml', 'utf-8');
  const doc = parser.parse(xml);
  const report = parseReport(doc);

  assert(report.title);
  assert(report.information.length >= 0);
});

test('parseInformation - normalizes single item to array', () => {
  const head = {
    Headline: {
      Information: {
        Item: {
          Kind: { Name: 'Test', Code: '01' },
          Areas: { Area: { Name: 'Area1', Code: '100000' } },
        },
      },
    },
  };

  const info = parseInformation(head);
  assert(Array.isArray(info));
  assert.strictEqual(info.length, 1);
});

test('buildStateEntry - creates state entry', () => {
  const info = {
    areaName: '新潟県',
    areaCode: '150000',
    kindName: '大雨注意報',
    kindCode: '10',
  };

  const entry = buildStateEntry(info);
  assert.strictEqual(entry.name, '大雨注意報');
  assert.strictEqual(entry.areaCode, '150000');
});
