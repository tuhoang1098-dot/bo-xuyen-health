const ALLOWED_DB_IDS = new Set([
  'ea677d7a-a61f-4455-bf71-82e7beec4095',
  '1058b7ac-5ea3-446c-93db-59d171b898d5',
]);

function checkAuth(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token.length > 0 && token === process.env.APP_PASSWORD;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { ALLOWED_DB_IDS, checkAuth, cors };
