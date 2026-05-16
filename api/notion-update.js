const { checkAuth, cors } = require('./_utils');
const { flatToNotionProps } = require('./_schema');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { page_id, properties } = req.body || {};
  if (!page_id || !properties) {
    return res.status(400).json({ error: 'Missing page_id or properties' });
  }

  const notionProps = flatToNotionProps(properties);

  const patchRes = await fetch(`https://api.notion.com/v1/pages/${page_id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: notionProps }),
  });

  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => ({}));
    return res.status(patchRes.status).json({ error: err.message || 'Notion API error' });
  }

  return res.json({ ok: true });
};
