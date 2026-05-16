const test = require('node:test');
const assert = require('node:assert/strict');
const { DOCUMENT_SCHEMAS, flatToProps, generateName } = require('./_document_schemas');

test('all four schemas exist with title + properties', () => {
  for (const t of ['cgm', 'labs', 'chemo', 'doctor_notes']) {
    assert.ok(DOCUMENT_SCHEMAS[t], `${t} schema missing`);
    assert.ok(DOCUMENT_SCHEMAS[t].title);
    assert.ok(DOCUMENT_SCHEMAS[t].properties.Name?.title);
  }
});

test('cgm schema has period + range fields', () => {
  const p = DOCUMENT_SCHEMAS.cgm.properties;
  assert.ok(p['Period Start'].date);
  assert.ok(p['Period End'].date);
  assert.ok(p['Avg Glucose (mmol/L)'].number);
  assert.ok(p['Time In Range (%)'].number);
});

test('labs schema has Status select with 4 options', () => {
  const opts = DOCUMENT_SCHEMAS.labs.properties.Status.select.options.map(o => o.name).sort();
  assert.deepEqual(opts, ['Critical', 'High', 'Low', 'Normal']);
});

test('flatToProps(cgm, record) builds Notion property shape', () => {
  const out = flatToProps('cgm', {
    Name: 'CGM 15/01–15/02',
    'Period Start': '2025-01-15',
    'Period End': '2025-02-15',
    Device: 'FreeStyle Libre 2',
    'Avg Glucose (mmol/L)': 7.8,
    'Time In Range (%)': 72,
    Notes: 'cháo days lower'
  });
  assert.equal(out.Name.title[0].text.content, 'CGM 15/01–15/02');
  assert.equal(out['Period Start'].date.start, '2025-01-15');
  assert.equal(out['Avg Glucose (mmol/L)'].number, 7.8);
  assert.equal(out.Device.rich_text[0].text.content, 'FreeStyle Libre 2');
});

test('flatToProps omits missing fields rather than nulling them', () => {
  const out = flatToProps('labs', { Name: 'X', Date: '2025-02-10' });
  assert.equal(out.Name.title[0].text.content, 'X');
  assert.equal(out.Date.date.start, '2025-02-10');
  assert.equal(out.Value, undefined);
  assert.equal(out['Test Name'], undefined);
});

test('flatToProps maps Status to select', () => {
  const out = flatToProps('labs', { Name: 'CA 19-9 — 2025-02-10', Date: '2025-02-10', Status: 'High' });
  assert.equal(out.Status.select.name, 'High');
});

test('flatToProps throws on unknown type', () => {
  assert.throws(() => flatToProps('banana', {}), /Unknown document type/);
});

test('generateName(cgm) formats range', () => {
  assert.equal(generateName('cgm', { 'Period Start': '2025-01-15', 'Period End': '2025-02-15' }), 'CGM 15/01–15/02');
});

test('generateName(labs) uses test name + date', () => {
  assert.equal(generateName('labs', { 'Test Name': 'CA 19-9', Date: '2025-02-10' }), 'CA 19-9 — 2025-02-10');
});

test('generateName(chemo) uses regimen + cycle + date', () => {
  assert.equal(generateName('chemo', { Regimen: 'FOLFIRINOX', 'Cycle Number': 5, Date: '2025-02-01' }), 'FOLFIRINOX Cycle 5 — 2025-02-01');
});

test('generateName(doctor_notes) uses doctor + date', () => {
  assert.equal(generateName('doctor_notes', { Doctor: 'BS. Hạnh', Date: '2025-02-10' }), 'BS. Hạnh — 2025-02-10');
});
