// Helper to strip quotes and whitespace
const sanitize = (val: string | undefined) => {
  if (!val) return "";
  return val.replace(/["']/g, "").trim();
};

// [수정] 오직 VITE_TMAP_APP_KEY만 확인
// import.meta.env 방식(Vite 표준)과 process.env 방식(호환성) 둘 다 체크
const rawKey = 
  import.meta.env.VITE_TMAP_APP_KEY || 
  process.env.VITE_TMAP_APP_KEY || 
  "";

// 디버깅용: 키가 없으면 콘솔에 경고
if (!rawKey) {
  console.warn("TMAP API Key가 없습니다. Vercel 환경변수(VITE_TMAP_APP_KEY)를 확인하세요.");
}

export const TMAP_APP_KEY = sanitize(rawKey);

export const TMAP_API_BASE = "https://apis.openapi.sk.com/tmap";
export const OPTIMIZATION_ENDPOINT = "/routes/routeOptimization10?version=1&format=json";
export const ROUTE_ENDPOINT = "/routes?version=1&format=json";
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
