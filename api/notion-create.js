const { checkAuth, cors, ALLOWED_DB_IDS } = require('./_utils');
const { flatToNotionProps } = require('./_schema');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { database_id, name, properties } = req.body || {};
  if (!database_id || !properties) {
    return res.status(400).json({ error: 'Missing database_id or properties' });
  }
  if (!ALLOWED_DB_IDS.has(database_id)) {
    return res.status(400).json({ error: 'Unknown database' });
  }

  const notionProps = flatToNotionProps(properties);
  if (name) {
    notionProps['Name'] = { title: [{ text: { content: name } }] };
  }

  const createRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id }, properties: notionProps }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    return res.status(createRes.status).json({ error: err.message || 'Notion API error' });
  }

  return res.json({ ok: true });
};
