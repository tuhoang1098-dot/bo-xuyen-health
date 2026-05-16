const { checkAuth, cors } = require('./_utils');

function notionPropsToFlat(pageId, props) {
  const flat = { _pageId: pageId };
  for (const [key, val] of Object.entries(props)) {
    switch (val.type) {
      case 'title':
        flat[key] = (val.title || []).map(t => t.plain_text).join('');
        break;
      case 'rich_text':
        flat[key] = (val.rich_text || []).map(t => t.plain_text).join('');
        break;
      case 'number':
        flat[key] = val.number;
        break;
      case 'select':
        flat[key] = val.select?.name ?? null;
        break;
      case 'multi_select':
        flat[key] = (val.multi_select || []).map(s => s.name);
        break;
      case 'date':
        flat[`date:${key}:start`] = val.date?.start ?? null;
        break;
      case 'checkbox':
        flat[key] = val.checkbox ? '__YES__' : '__NO__';
        break;
    }
  }
  return flat;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { page_id } = req.body || {};
  if (!page_id) return res.status(400).json({ error: 'Missing page_id' });

  const pageRes = await fetch(`https://api.notion.com/v1/pages/${page_id}`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
    },
  });

  if (!pageRes.ok) {
    const err = await pageRes.json().catch(() => ({}));
    return res.status(pageRes.status).json({ error: err.message || 'Notion API error' });
  }

  const page = await pageRes.json();
  const flat = notionPropsToFlat(page.id, page.properties || {});
  return res.json({ text: `<properties>${JSON.stringify(flat)}</properties>` });
};
