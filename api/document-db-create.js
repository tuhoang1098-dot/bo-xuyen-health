const { checkAuth, cors } = require('./_utils');
const { DOCUMENT_SCHEMAS } = require('./_document_schemas');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { type } = req.body || {};
  if (!type) return res.status(400).json({ error: 'Missing type' });
  const schema = DOCUMENT_SCHEMAS[type];
  if (!schema) return res.status(400).json({ error: `Unknown type: ${type}` });

  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  if (!parentPageId) return res.status(500).json({ error: 'Server missing NOTION_PARENT_PAGE_ID env var' });

  const createRes = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: schema.title } }],
      properties: schema.properties
    })
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    return res.status(createRes.status).json({ error: err.message || 'Notion API error' });
  }
  const data = await createRes.json();
  return res.json({ id: data.id, title: schema.title });
};
