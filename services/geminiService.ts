
import { API_BASE, GEMINI_ENDPOINT } from '../constants';

export interface FileInput {
  base64Data: string;
  mimeType: string;
}

export async function extractAddressesFromFiles(files: FileInput[]): Promise<string[]> {
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

    const addresses: string[] = await response.json();
    return addresses;
  } catch (error: any) {
    console.error("Address Extraction Error:", error);
    throw new Error(error.message || "주소 추출 중 오류가 발생했습니다.");
  }
}
