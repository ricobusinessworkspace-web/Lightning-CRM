export default async function handler(req, res) {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } 
    });
    
    const text = await response.text();
    
    // We send it back as JSON to match the old IPC interface which returned text that was optionally parsed
    res.status(200).send(text);
  } catch (error) {
    console.error('Proxy fetch error:', error);
    res.status(500).json({ error: error.message });
  }
}
