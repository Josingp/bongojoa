
import { GoogleGenAI, Type } from "@google/genai";

// Declare process for TypeScript to avoid compilation errors
declare var process: any;

// Polyfill 'process' for browser environments (Vite/Vercel)
// This prevents the "ReferenceError: process is not defined" that causes the blank screen.
if (typeof process === "undefined") {
  (window as any).process = { env: {} };
}

// Map the Vercel/Vite environment variable (VITE_GOOGLE_GENAI_API_KEY) 
// to process.env.API_KEY as strictly required by the @google/genai SDK guidelines.
if (!process.env.API_KEY && (import.meta as any).env) {
    process.env.API_KEY = (import.meta as any).env.VITE_GOOGLE_GENAI_API_KEY || "";
}

// Initialize the SDK with process.env.API_KEY
// The key might be empty initially; we handle the missing key error during the API call.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function extractAddressesFromImage(base64Image: string, mimeType: string): Promise<string[]> {
  // Runtime check for API Key
  if (!process.env.API_KEY) {
    console.warn("Gemini API Key is missing. Please set VITE_GOOGLE_GENAI_API_KEY in Vercel settings.");
    throw new Error("AI 기능을 사용하려면 설정에서 VITE_GOOGLE_GENAI_API_KEY 환경변수가 필요합니다.");
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-latest',
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
