const { checkAuth, cors } = require('./_utils');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { database_id } = req.body || {};
  if (!database_id) return res.status(400).json({ error: 'Missing database_id' });

  const notionRes = await fetch(
    `https://api.notion.com/v1/databases/${database_id}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 25 }),
    }
  );

  if (!notionRes.ok) {
    const err = await notionRes.json().catch(() => ({}));
    return res.status(notionRes.status).json({ error: err.message || 'Notion API error' });
  }

  const data = await notionRes.json();
  return res.json({ results: (data.results || []).map(p => ({ id: p.id })) });
};
