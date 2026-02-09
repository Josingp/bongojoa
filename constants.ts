

// TMAP API 키 가져오기
// Vercel 및 Vite 환경에서는 환경변수 이름이 반드시 'VITE_'로 시작해야 합니다.
// Vercel Settings > Environment Variables 에서 'VITE_TMAP_APP_KEY'를 설정하세요.

const getApiKey = (): string => {
  // 1. Vite / Vercel 환경 (표준)
  const meta = import.meta as any;
  if (typeof meta !== 'undefined' && meta.env) {
    if (meta.env.VITE_TMAP_APP_KEY) {
      return meta.env.VITE_TMAP_APP_KEY;
    }
  }

  // 2. Node.js 환경 호환 (필요한 경우)
  if (typeof process !== 'undefined' && process.env) {
    // Vercel 시스템 환경변수 혹은 레거시 설정
    return process.env.VITE_TMAP_APP_KEY || process.env.TMAP_APP_KEY || "";
  }

  return "";
};

export const TMAP_APP_KEY = getApiKey();

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
