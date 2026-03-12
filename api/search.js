
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

    const q = encodeURIComponent(query);
    const url = `${supabaseUrl}/rest/v1/wines?select=*,prices(price_amount,currency,url,in_stock,shipping_cost,providers(name,website))&or=(name.ilike.*${q}*,region.ilike.*${q}*,grape.ilike.*${q}*,country.ilike.*${q}*,type.ilike.*${q}*)`;

    const dbResponse = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    const dbResults = await dbResponse.json();

    // Return debug info so we can see what's happening
    return res.status(200).json({ 
      source: 'debug',
      supabaseStatus: dbResponse.status,
      resultCount: Array.isArray(dbResults) ? dbResults.length : 'not array',
      firstResult: Array.isArray(dbResults) ? dbResults[0]?.name : dbResults,
      urlUsed: url.substring(0, 300)
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
