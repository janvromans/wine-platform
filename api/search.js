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

    // ============================================================
    // PRICE QUERY DETECTION
    // Detects queries like "under €30", "cheap Bordeaux", "best value red"
    // ============================================================
    const q = query.toLowerCase();

    // Extract max price from query (e.g. "under €30", "below 50", "cheaper than €40")
    const priceMatch = q.match(/(?:under|below|cheaper than|less than|max|maximum|tot|onder|minder dan)\s*[€$]?\s*(\d+)/i)
                    || q.match(/[€$]\s*(\d+)/i)
                    || q.match(/(\d+)\s*(?:euro|eur|€)/i);
    const maxPrice = priceMatch ? parseFloat(priceMatch[1]) : null;

    // Detect value/budget intent
    const isBudget = /\b(cheap|budget|affordable|value|bargain|goedkoop|voordelig|best value|good value)\b/.test(q);

    // Extract wine type/region keywords (strip price-related words)
    const cleanQuery = q
      .replace(/under|below|cheaper than|less than|max|maximum|tot|onder|minder dan/gi, '')
      .replace(/[€$]\s*\d+/g, '')
      .replace(/\d+\s*(?:euro|eur)/gi, '')
      .replace(/cheap|budget|affordable|value|bargain|goedkoop|voordelig|best value|good value/gi, '')
      .replace(/wine|wines|wijn|wijnen/gi, '')
      .trim();

    let dbResults = [];

    if (maxPrice || isBudget) {
      // PRICE-BASED SEARCH
      // Search prices table for wines within budget, join with wines and providers
      let priceUrl = `${supabaseUrl}/rest/v1/prices?select=price_amount,shipping_cost,currency,url,in_stock,providers(name,website),wines(id,name,region,country,grape,type,description)&in_stock=eq.true&order=price_amount.asc`;

      if (maxPrice) {
        priceUrl += `&price_amount=lte.${maxPrice}`;
      } else if (isBudget) {
        // Default budget cap at €30 if no price specified
        priceUrl += `&price_amount=lte.30`;
      }

      // Add wine type/region filter if keywords remain
      if (filter && filter !== 'All') {
        // We'll filter after fetching since we're querying prices table
      }

      const priceResponse = await fetch(priceUrl, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      const priceResults = await priceResponse.json();

      if (Array.isArray(priceResults) && priceResults.length > 0) {
        // Filter by wine type if filter chip is active
        let filtered = priceResults.filter(p => p.wines);
        if (filter && filter !== 'All') {
          filtered = filtered.filter(p => p.wines?.type?.toLowerCase() === filter.toLowerCase());
        }

        // Filter by remaining keywords (region, grape, etc.)
        if (cleanQuery.length > 2) {
          const keywords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
          filtered = filtered.filter(p => {
            const wine = p.wines;
            const searchable = `${wine.name} ${wine.region} ${wine.country} ${wine.grape} ${wine.type}`.toLowerCase();
            return keywords.some(kw => searchable.includes(kw));
          });
        }

        // Group by wine, keep best price per wine
        const wineMap = {};
        filtered.forEach(p => {
          const wineId = p.wines.id;
          if (!wineMap[wineId]) {
            wineMap[wineId] = { ...p.wines, prices: [] };
          }
          wineMap[wineId].prices.push({
            price_amount: p.price_amount,
            shipping_cost: p.shipping_cost,
            in_stock: p.in_stock,
            url: p.url,
            providers: p.providers
          });
        });

        dbResults = Object.values(wineMap).slice(0, 6);
      }

    } else {
      // STANDARD WINE NAME / REGION / GRAPE SEARCH
      const q = encodeURIComponent(query);
let url = `${supabaseUrl}/rest/v1/wines?select=*,prices(price_amount,currency,url,in_stock,shipping_cost,providers(name,website))&or=(name.ilike.*${q}*,region.ilike.*${q}*,grape.ilike.*${q}*,country.ilike.*${q}*,type.ilike.*${q}*)`;

      if (filter && filter !== 'All') {
        url += `&type=eq.${encodeURIComponent(filter)}`;
      }

      const dbResponse = await fetch(url, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      dbResults = await dbResponse.json();
      if (dbResults && dbResults.length === 0) {
  return res.status(200).json({ source: 'debug', query: query, url: url.substring(0, 200), status: dbResponse.status });
}
    }

    if (Array.isArray(dbResults) && dbResults.length > 0) {
      return res.status(200).json({
        source: 'database',
        results: dbResults,
        priceSearch: !!(maxPrice || isBudget),
        maxPrice: maxPrice
      });
    }

    // ============================================================
    // FALL BACK TO CLAUDE AI
    // ============================================================
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
          content: `You are a wine expert for Vinora, a European wine price comparison platform. Return ONLY a valid JSON array of 2-3 wine results for the query "${query}". Each result must have exactly these fields: name, region, score, description, offers. offers is an array of 2 objects each with: source, price, shipping, best. Use realistic European wine retailers (Millesima, Vinatis, Wijnkopen.nl, Gall & Gall, WineWorld, Tannico) and realistic Euro prices. If the query mentions a price limit, respect it. Filter type: ${filter || 'All'}. Example format: [{"name":"Example Wine","region":"Bordeaux, France","score":"91 pts","description":"Elegant and complex.","offers":[{"source":"Millesima","price":"€28.00","shipping":"Free shipping","best":true},{"source":"Vinatis","price":"€32.00","shipping":"€6.90","best":false}]}]`
        }]
      })
    });

    const claudeData = await claudeResponse.json();
    const text = claudeData.content?.[0]?.text || '[]';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ error: 'No JSON found' });
    const aiResults = JSON.parse(match[0]);
    return res.status(200).json({ source: 'ai', results: aiResults });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
