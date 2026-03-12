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

    // Search wines and join with prices and providers
    let url = `${supabaseUrl}/rest/v1/wines?select=*,prices(price_amount,currency,url,in_stock,shipping_cost,providers(name,website))&or=(name.ilike.*${encodeURIComponent(query)}*,region.ilike.*${encodeURIComponent(query)}*,grape.ilike.*${encodeURIComponent(query)}*,country.ilike.*${encodeURIComponent(query)}*,type.ilike.*${encodeURIComponent(query)}*)`;

    if (filter && filter !== 'All') {
      url += `&type=eq.${encodeURIComponent(filter)}`;
    }

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
          content: `You are a wine expert for Vinora. Return ONLY a valid JSON array of 2-3 wine results for the query "${query}". Each result must have exactly these fields: name, region, score, description, offers. offers is an array of 2 objects each with: source, price, shipping, best. Example: [{"name":"Chateau Margaux","region":"Bordeaux, France","score":"94 pts","description":"Elegant and complex.","offers":[{"source":"Millesima","price":"€89.00","shipping":"Free shipping","best":true},{"source":"Vinatis","price":"€95.00","shipping":"€6.90","best":false}]}]`
        }]
      })
    });

    const claudeData = await claudeResponse.json();
    const text = claudeData.content?.[0]?.text || '[]';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ error: 'No JSON found', text });
    const aiResults = JSON.parse(match[0]);
    return res.status(200).json({ source: 'ai', results: aiResults });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
