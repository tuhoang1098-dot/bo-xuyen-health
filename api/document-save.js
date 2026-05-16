const { checkAuth, cors } = require('./_utils');
const { DOCUMENT_SCHEMAS, flatToProps } = require('./_document_schemas');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { database_id, type, records } = req.body || {};
  if (!database_id) return res.status(400).json({ error: 'Missing database_id' });
  if (!type) return res.status(400).json({ error: 'Missing type' });
  if (!DOCUMENT_SCHEMAS[type]) return res.status(400).json({ error: `Unknown type: ${type}` });
  if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'records must be a non-empty array' });

  const pageIds = [];
  for (const record of records) {
    const properties = flatToProps(type, record);
    const createRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id }, properties })
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      return res.status(createRes.status).json({ error: err.message || 'Notion API error', saved_so_far: pageIds });
    }
    const data = await createRes.json();
    pageIds.push(data.id);
  }
  return res.json({ ok: true, page_ids: pageIds });
};
