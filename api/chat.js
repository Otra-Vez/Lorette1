// Vercel defaults serverless functions to a 10s timeout, which a Claude
// generation routinely exceeds. Hobby allows up to 60s.
export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: 'Server is missing ANTHROPIC_API_KEY' } });
  }

  const { messages, system, max_tokens, stream, tools } = req.body || {};

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
