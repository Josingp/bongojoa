import { GoogleGenAI, Type } from "@google/genai";

// Declare process for TypeScript to satisfy compiler
declare var process: any;

// Initialize SDK using process.env.API_KEY as required by guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function extractAddressesFromImage(base64Image: string, mimeType: string): Promise<string[]> {
  // Runtime check for API Key
  if (!process.env.API_KEY) {
    console.warn("Gemini API Key is missing. Please set VITE_GOOGLE_GENAI_API_KEY environment variable.");
    throw new Error("AI 기능을 사용하려면 설정에서 VITE_GOOGLE_GENAI_API_KEY 환경변수가 필요합니다.");
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType
            }
          },
          {
            text: "Extract all distinct addresses or place names visible in this image. Focus on South Korean addresses if possible. Ignore phone numbers. Return a clean JSON list of strings."
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
      return JSON.parse(response.text);
    }
    return [];
  } catch (error: any) {
    console.error("Gemini Vision Error:", error);
    throw new Error(error.message || "이미지 분석 중 오류가 발생했습니다.");
  }
}