const test = require('node:test');
const assert = require('node:assert/strict');

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (j) => { res.body = j; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  return res;
}

const ORIGINAL_PWD = process.env.APP_PASSWORD;
test.before(() => { process.env.APP_PASSWORD = 'testpw'; });
test.after(() => { process.env.APP_PASSWORD = ORIGINAL_PWD; });

const handler = require('./document-save');

test('OPTIONS returns 200', async () => {
  const res = mockRes();
  await handler({ method: 'OPTIONS', headers: {} }, res);
  assert.equal(res.statusCode, 200);
});

test('rejects without auth', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { database_id: 'x', type: 'cgm', records: [] } }, res);
  assert.equal(res.statusCode, 401);
});

test('rejects missing database_id', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { type: 'cgm', records: [{}] } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /database_id/);
});

test('rejects missing type', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { database_id: 'x', records: [{}] } }, res);
  assert.equal(res.statusCode, 400);
});

test('rejects unknown type', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { database_id: 'x', type: 'banana', records: [{}] } }, res);
  assert.equal(res.statusCode, 400);
});

test('rejects missing records', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { database_id: 'x', type: 'cgm' } }, res);
  assert.equal(res.statusCode, 400);
});

test('rejects empty records array', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { database_id: 'x', type: 'cgm', records: [] } }, res);
  assert.equal(res.statusCode, 400);
});
