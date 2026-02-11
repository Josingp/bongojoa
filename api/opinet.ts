
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.OPINET_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: OPINET_API_KEY missing' });
  }

  try {
    const url = `http://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Opinet API responded with ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
