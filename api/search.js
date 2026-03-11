export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { query, filter } = req.body;
    if (!query) return res.status(400).json({ error: 'No query provided' });

    // Test response first
    return res.status(200).json({ 
      source: 'test', 
      message: 'API is working!',
      query: query 
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
