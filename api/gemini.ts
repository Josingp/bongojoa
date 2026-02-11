
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // [수정] 사용자 요청에 따라 GOOGLE_GENAI_API_KEY를 우선적으로 확인합니다.
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.API_KEY;

  if (!apiKey) {
    // 키가 없는 경우 어떤 키를 찾고 있었는지 명확히 에러 메시지에 포함 (디버깅 용이)
    return res.status(500).json({ error: 'Server configuration error: GOOGLE_GENAI_API_KEY or API_KEY missing' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { files } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Construct parts from files
    const fileParts = files.map((file: any) => ({
      inlineData: {
        data: file.base64Data,
        mimeType: file.mimeType
      }
    }));

    // Generate content using Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', // 최신 모델 사용 권장 (또는 'gemini-1.5-flash')
      contents: {
        parts: [
          ...fileParts,
          {
            text: "Extract all distinct addresses or place names visible in these images or documents. Focus on South Korean addresses if possible. Ignore phone numbers. Return a clean JSON list of strings."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    if (response.text) {
      const addresses = JSON.parse(response.text);
      return res.status(200).json(addresses);
    }
    
    return res.status(200).json([]);

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message || "Failed to process images with Gemini" });
  }
}
