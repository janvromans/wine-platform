export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { query, filter } = req.body;
    if (!query) return res.status(400).json({ error: 'No query provided' });

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(500).json({ error: 'Missing API key' });

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a wine expert for Vinora. Return ONLY a valid JSON array of 2-3 wine results for the query "${query}". Each result must have: name, region, score, description, offers (array with source, price, shipping, best). Use realistic European retailers and Euro prices. Filter: ${filter || 'All'}. Return ONLY the JSON array, nothing else.`
        }]
      })
    });

    const claudeData = await claudeResponse.json();
    const text = claudeData.content?.[0]?.text || '[]';
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const aiResults = JSON.parse(cleaned);
    return res.status(200).json({ source: 'ai', results: aiResults });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
