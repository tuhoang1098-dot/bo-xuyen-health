const { checkAuth, cors } = require('./_utils');

const rateLimitMap = new Map();
const MAX_REQUESTS = 60;
const WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > MAX_REQUESTS;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu. Thử lại sau 1 giờ.' });
  }

  const { model, messages, system, max_tokens, tools } = req.body || {};
  if (!messages) return res.status(400).json({ error: 'Missing messages' });

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      max_tokens: max_tokens || 1024,
      system,
      messages,
      ...(tools ? { tools } : {}),
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json().catch(() => ({}));
    return res.status(anthropicRes.status).json({ error: err.error?.message || 'Anthropic API error' });
  }

  const data = await anthropicRes.json();
  return res.json(data);
};
