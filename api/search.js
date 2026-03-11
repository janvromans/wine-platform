export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { query, filter } = req.body;

    if (!query) return res.status(400).json({ error: 'No query provided' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    let url = `${supabaseUrl}/rest/v1/wines?select=*&or=(name.ilike.*${encodeURIComponent(query)}*,region.ilike.*${encodeURIComponent(query)}*,grape.ilike.*${encodeURIComponent(query)}*,country.ilike.*${encodeURIComponent(query)}*)`;

    const dbResponse = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    const dbResults = await dbResponse.json();

    if (Array.isArray(dbResults) && dbResults.length > 0) {
      return res.status(200).json({ source: 'database', results: dbResults });
    }

    // Fall back to Claude AI
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(500).json({ error: 'Missing Anthropic API key' });
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: `You are a wine expert AI for Vinora. Return ONLY a valid JSON array of 2-3 wine results with fields: name, region, score, description, offers (array with source, price, shipping, best). Use realistic European retailers and Euro prices. Filter type: ${filter || 'All'}.`,
        messages: [{ role: 'user', content: `Search: "${query}"` }]
      })
    });

    const claudeData = await claudeResponse.json();
    const text = claudeData.content?.[0]?.text || '[]';
    const aiResults = JSON.parse(text.replace(/```json|```/g, '').trim());
    return res.status(200).json({ source: 'ai', results: aiResults });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
