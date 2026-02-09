
import { GoogleGenAI, Type } from "@google/genai";

// Declare process for TypeScript to satisfy compiler
declare var process: any;

// Initialize SDK using process.env.API_KEY as required by guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface FileInput {
  base64Data: string;
  mimeType: string;
}

export async function extractAddressesFromFiles(files: FileInput[]): Promise<string[]> {
  // Runtime check for API Key
  if (!process.env.API_KEY) {
    console.warn("Gemini API Key is missing. Please set VITE_GOOGLE_GENAI_API_KEY environment variable.");
    throw new Error("AI 기능을 사용하려면 설정에서 VITE_GOOGLE_GENAI_API_KEY 환경변수가 필요합니다.");
  }

  if (files.length === 0) return [];

  try {
    // Construct parts from multiple files
    const fileParts = files.map(file => ({
      inlineData: {
        data: file.base64Data,
        mimeType: file.mimeType
      }
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
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
      return JSON.parse(response.text);
    }
    return [];
  } catch (error: any) {
    console.error("Gemini Vision Error:", error);
    throw new Error(error.message || "파일 분석 중 오류가 발생했습니다.");
  }
}
