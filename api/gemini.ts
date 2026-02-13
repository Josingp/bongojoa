
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
      model: 'gemini-2.0-flash', // 최신 모델 사용 권장
      contents: {
        parts: [
          ...fileParts,
          {
            text: `이미지 또는 PDF 문서에서 인식 가능한 모든 주소와 장소명을 하나도 빠짐없이 추출하세요.
            
            지침:
            1. 'address'와 'role'을 포함한 JSON 리스트를 반환하세요.
            2. 문서 내의 모든 장소(상차지, 하차지, 경유지, 업체명, 센터명 등)를 추출 대상으로 합니다. 목록이 길더라도 생략하지 마세요.
            3. 장소명만 적혀있는 경우(예: "투썸플레이스 화곡점"), 해당 장소를 검색하여 정확한 도로명 주소나 지번 주소로 변환하여 'address' 필드에 넣으세요.
            4. role 구분:
               - '상차지', '출발', 'From' -> 'start'
               - '하차지', '도착', 'To', '목적지' -> 'end'
               - 그 외 단순 경유지나 방문지는 -> 'via'
            5. 대한민국 주소 체계에 집중하고, 우편번호나 전화번호는 제외한 순수 주소 문자열만 반환하세요. (예: "서울특별시 강남구 테헤란로 123")`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        // 결과가 많을 경우를 대비해 토큰 제한을 넉넉히 설정 (필요시 추가)
        // maxOutputTokens: 2048, 
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              address: { type: Type.STRING },
              role: { type: Type.STRING, enum: ["start", "end", "via", "unknown"] }
            },
            required: ["address", "role"]
          }
        }
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text);
      return res.status(200).json(parsed);
    }
    
    return res.status(200).json([]);

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message || "Failed to process images with Gemini" });
  }
}
