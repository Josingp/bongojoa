
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // [성능] 캐싱 헤더 설정: 1시간(3600초) 동안 캐시, 갱신 중에도 59초간 기존 데이터 제공
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=59');

  const apiKey = process.env.OPINET_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: OPINET_API_KEY missing' });
  }

  try {
    const url = `http://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      throw new Error(`Opinet API responded with ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
}
