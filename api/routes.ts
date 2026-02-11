
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// 서버 사이드용 Supabase 클라이언트 생성 (Service Role Key 사용)
// 주의: Service Role Key는 절대 클라이언트에 노출되면 안 됩니다.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. GET 요청: 저장된 경로 불러오기
  if (req.method === 'GET') {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const { data, error } = await supabase
      .from('saved_routes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // 2. POST 요청: 경로 저장하기
  if (req.method === 'POST') {
    const { userId, name, data: routeData } = req.body;

    if (!userId || !name || !routeData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('saved_routes')
      .insert([
        {
          user_id: userId,
          name: name, // DB 컬럼명에 맞춤
          data: routeData // DB 컬럼명에 맞춤
        }
      ])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data });
  }

  // 3. DELETE 요청: 경로 삭제하기
  if (req.method === 'DELETE') {
      const { id, userId } = req.body;
      
      if (!id || !userId) {
          return res.status(400).json({ error: 'Missing required fields' });
      }

      const { error } = await supabase
          .from('saved_routes')
          .delete()
          .eq('id', id)
          .eq('user_id', userId); // 본인 것만 삭제 가능하도록

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
  }

  // 지원하지 않는 메소드
  return res.status(405).json({ error: 'Method Not Allowed' });
}
