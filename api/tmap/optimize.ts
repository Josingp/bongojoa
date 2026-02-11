
import type { VercelRequest, VercelResponse } from '@vercel/node';

const TMAP_API_BASE = "https://apis.openapi.sk.com/tmap";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.TMAP_APP_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: TMAP_APP_KEY missing' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const url = `${TMAP_API_BASE}/routes/routeOptimization10?version=1&format=json`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'appKey': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
