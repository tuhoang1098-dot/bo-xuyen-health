const ALLOWED_DB_IDS = new Set([
  '13c0deff-9077-4fa9-bb05-3728f8f4c871',
  '63ff99c4-fa38-4263-a5e0-a7a0051af68d',
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
