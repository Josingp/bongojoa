// [수정] 발급받으신 실제 키를 여기에 직접 넣었습니다.
const REAL_TMAP_KEY = "26b5POkPf6ftvoYzxzLpatepZAVqZ8slAQKSR7d0"; 

// 환경변수 무시하고 위에서 입력한 키를 강제로 사용합니다.
const rawKey = REAL_TMAP_KEY;

const sanitize = (val: string | undefined) => {
  if (!val) return "";
  return val.replace(/["']/g, "").trim();
};

export const TMAP_APP_KEY = sanitize(rawKey);

export const TMAP_API_BASE = "https://apis.openapi.sk.com/tmap";
export const OPTIMIZATION_ENDPOINT = "/routes/routeOptimization10?version=1&format=json";
export const ROUTE_ENDPOINT = "/routes?version=1&format=json";
export const POI_SEARCH_ENDPOINT = "/pois?version=1";

export const DEFAULT_START_LOCATION = { id: 'start', name: '서울역', lat: '37.554678', lng: '126.970606' };
export const DEFAULT_END_LOCATION = { id: 'end', name: '강남역', lat: '37.498095', lng: '127.027610' };

export const PRESET_LOCATIONS = [
  { name: "N서울타워", lat: "37.551169", lng: "126.988227" },
  { name: "롯데월드", lat: "37.511115", lng: "127.098167" },
  { name: "경복궁", lat: "37.579617", lng: "126.977041" },
  { name: "홍대입구", lat: "37.557527", lng: "126.924466" },
  { name: "여의도 공원", lat: "37.523850", lng: "126.918917" },
  { name: "이태원", lat: "37.534245", lng: "126.994078" }
];
