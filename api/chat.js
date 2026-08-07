// Vercel defaults serverless functions to a 10s timeout, which a Claude
// generation routinely exceeds. Hobby allows up to 60s.
export const config = {
  maxDuration: 60,
};

// Venue lists for a given city don't change hour to hour, and every fetch
// costs real money — web searches are billed per search, and the results come
// back as input tokens too. So a repeat request for the same city and category
// is served from memory rather than paid for twice.
//
// This lives in the function instance, which Vercel keeps warm for a few
// minutes and then discards. So it catches bursts — someone testing, or two
// people planning Nashville the same afternoon — but not everything. A shared
// store like Upstash would push the hit rate near 100%; the logic here is the
// same either way, so that swap is small when it's worth making.
const CACHE = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // a day; venues don't move faster
const CACHE_MAX = 200;                     // bounded so memory can't run away

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  // Refresh recency so popular cities survive eviction
  CACHE.delete(key);
  CACHE.set(key, hit);
  return hit.data;
}

function cacheSet(key, data) {
  if (CACHE.size >= CACHE_MAX) {
    // Map preserves insertion order, so the first key is the least recent
    CACHE.delete(CACHE.keys().next().value);
  }
  CACHE.set(key, { at: Date.now(), data });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: 'Server is missing ANTHROPIC_API_KEY' } });
  }

  const { messages, system, max_tokens, stream, tools, cacheKey } = req.body || {};

  // Only cacheable when the client says so — it knows whether this request is
  // personalised. Streaming responses aren't cached; they're piped straight through.
  if (cacheKey && !stream) {
    const hit = cacheGet(cacheKey);
    if (hit) {
      res.setHeader('X-Lorette-Cache', 'hit');
      return res.status(200).json(hit);
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 4000,
        system,
        messages,
        ...(Array.isArray(tools) && tools.length ? { tools } : {}),
        ...(stream ? { stream: true } : {}),
      }),
    });

    // Errors come back as JSON even on a streaming request
    if (!response.ok) {
      let detail = {};
      try { detail = await response.json(); } catch {}
      return res.status(response.status).json({
        error: {
          message: detail?.error?.message || `Anthropic returned ${response.status}`,
          type: detail?.error?.type || 'api_error',
        },
      });
    }

    if (!stream) {
      const data = await response.json();
      // Only cache a real answer — never an error or an empty turn
      if (cacheKey && Array.isArray(data?.content) && data.content.length) {
        cacheSet(cacheKey, data);
      }
      res.setHeader('X-Lorette-Cache', cacheKey ? 'miss' : 'skip');
      return res.status(200).json(data);
    }

    // Pipe the server-sent event stream straight through to the browser
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
      if (typeof res.flush === 'function') res.flush();
    }
    return res.end();
  } catch (error) {
    if (res.headersSent) return res.end();
    return res.status(502).json({
      error: { message: `Could not reach Anthropic: ${error.message}`, type: 'network_error' },
    });
  }
}
