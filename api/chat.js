export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: 'Server is missing ANTHROPIC_API_KEY' } });
  }

  const { messages, system, max_tokens } = req.body || {};

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
      }),
    });

    const data = await response.json();

    // Pass Anthropic's own status and error through instead of hiding it,
    // so the app can tell "out of credit" from "overloaded" from "too long".
    if (!response.ok) {
      return res.status(response.status).json({
        error: {
          message: data?.error?.message || `Anthropic returned ${response.status}`,
          type: data?.error?.type || 'api_error',
        },
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      error: { message: `Could not reach Anthropic: ${error.message}`, type: 'network_error' },
    });
  }
}
