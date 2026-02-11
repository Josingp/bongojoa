
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. GET: List places
  if (req.method === 'GET') {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const { data, error } = await supabase
      .from('saved_places')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // 2. POST: Add place
  if (req.method === 'POST') {
    const { userId, name, lat, lng } = req.body;
    if (!userId || !name || !lat || !lng) return res.status(400).json({ error: 'Missing fields' });

    const { data, error } = await supabase
      .from('saved_places')
      .insert([{ user_id: userId, name, lat, lng }])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data });
  }

  // 3. DELETE: Remove place
  if (req.method === 'DELETE') {
    const { id, userId } = req.body;
    if (!id || !userId) return res.status(400).json({ error: 'Missing fields' });

    const { error } = await supabase
      .from('saved_places')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
