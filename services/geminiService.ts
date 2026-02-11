
import { API_BASE, GEMINI_ENDPOINT } from '../constants';

export interface FileInput {
  base64Data: string;
  mimeType: string;
}

export interface ExtractedAddress {
  address: string;
  role: 'start' | 'end' | 'via' | 'unknown';
}

export async function extractAddressesFromFiles(files: FileInput[]): Promise<ExtractedAddress[]> {
  if (files.length === 0) return [];

  try {
    const response = await fetch(`${API_BASE}${GEMINI_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server responded with ${response.status}`);
    }

    const data = await response.json();
    // Validate that data is an array
    if (Array.isArray(data)) {
        return data as ExtractedAddress[];
    }
    return [];
  } catch (error: any) {
    console.error("Address Extraction Error:", error);
    throw new Error(error.message || "주소 추출 중 오류가 발생했습니다.");
  }
}
