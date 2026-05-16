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

const handler = require('./document-db-create');

test('OPTIONS returns 200', async () => {
  const res = mockRes();
  await handler({ method: 'OPTIONS', headers: {} }, res);
  assert.equal(res.statusCode, 200);
});

test('rejects without auth', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { type: 'cgm' } }, res);
  assert.equal(res.statusCode, 401);
});

test('rejects unknown type', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { type: 'banana' } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Unknown type/);
});

test('rejects missing type', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('rejects missing NOTION_PARENT_PAGE_ID', async () => {
  const oldParent = process.env.NOTION_PARENT_PAGE_ID;
  delete process.env.NOTION_PARENT_PAGE_ID;
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { type: 'cgm' } }, res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /NOTION_PARENT_PAGE_ID/);
  if (oldParent === undefined) delete process.env.NOTION_PARENT_PAGE_ID;
  else process.env.NOTION_PARENT_PAGE_ID = oldParent;
});
