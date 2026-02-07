
// TMAP API 키 가져오기
// Vite 환경에서는 VITE_ 접두사가 필수입니다.

const getApiKey = (): string => {
  let key = "";

  // 1. import.meta.env 확인 (Vite 표준)
  try {
    // @ts-ignore
    if (import.meta && import.meta.env) {
      // @ts-ignore
      key = import.meta.env.VITE_TMAP_APP_KEY || "";
    }
  } catch (e) {
    // import.meta가 없는 환경 무시
  }

  // 2. process.env 확인 (Node.js/Vercel 호환)
  if (!key && typeof process !== 'undefined' && process.env) {
    key = process.env.VITE_TMAP_APP_KEY || process.env.TMAP_APP_KEY || "";
  }

  return key.trim();
};

export const TMAP_APP_KEY = getApiKey();

// 개발 환경에서 키 로드 상태 확인 로그
if (process.env.NODE_ENV === 'development') {
  console.log(`[TMAP 키 상태] ${TMAP_APP_KEY ? "로드 성공" : "실패 - Vercel 환경변수(VITE_TMAP_APP_KEY)를 확인하세요."}`);
}

export const TMAP_API_BASE = "https://apis.openapi.sk.com/tmap";

// 경로 최적화 API (버전 10)
export const OPTIMIZATION_ENDPOINT = "/routes/routeOptimization10?version=1&format=json";

// 일반 경로 탐색 API
export const ROUTE_ENDPOINT = "/routes?version=1&format=json";

// 장소 검색 API
export const POI_SEARCH_ENDPOINT = "/pois?version=1";

export const DEFAULT_START_LOCATION = {
  id: 'start',
  name: '서울역',
  lat: '37.554678',
  lng: '126.970606'
};

export const DEFAULT_END_LOCATION = {
  id: 'end',
  name: '강남역',
  lat: '37.498095',
  lng: '127.027610'
};

export const PRESET_LOCATIONS = [
  { name: "N서울타워", lat: "37.551169", lng: "126.988227" },
  { name: "롯데월드", lat: "37.511115", lng: "127.098167" },
  { name: "경복궁", lat: "37.579617", lng: "126.977041" },
  { name: "홍대입구", lat: "37.557527", lng: "126.924466" },
  { name: "여의도 공원", lat: "37.523850", lng: "126.918917" },
  { name: "이태원", lat: "37.534245", lng: "126.994078" }
];
