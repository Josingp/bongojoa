
import type { VercelRequest, VercelResponse } from '@vercel/node';

const TMAP_API_BASE = "https://apis.openapi.sk.com/tmap";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.TMAP_APP_KEY;
  const { lat, lon } = req.query;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: TMAP_APP_KEY missing' });
  }

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Latitude and Longitude are required' });
  }

  try {
    const url = `${TMAP_API_BASE}/geo/reversegeocoding?version=1&addressType=A10&coordType=WGS84GEO&lat=${lat}&lon=${lon}&appKey=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`TMAP API responded with ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
