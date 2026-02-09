// TMAP API 키 가져오기
// Vercel 및 Vite 환경에서는 환경변수 이름이 반드시 'VITE_'로 시작해야 합니다.
// Vercel Settings > Environment Variables 에서 'VITE_TMAP_APP_KEY'를 설정하세요.

// Declare process for TypeScript
declare var process: any;

// Vite의 define 플러그인에 의해 빌드 시점/런타임에 문자열로 치환됩니다.
export const TMAP_APP_KEY = process.env.VITE_TMAP_APP_KEY || "";

export const TMAP_API_BASE = "https://apis.openapi.sk.com/tmap";

// 경로 최적화 API (버전 10)
export const OPTIMIZATION_ENDPOINT = "/routes/routeOptimization10?version=1&format=json";

// 일반 경로 탐색 API
export const ROUTE_ENDPOINT = "/routes?version=1&format=json";

// 장소 검색 API
export const POI_SEARCH_ENDPOINT = "/pois?version=1";

export const DEFAULT_START_LOCATION = {
  id: 'start',
  name: '여의도역3번출구',
  lat: '37.522491',
  lng: '126.923697'
};

export const DEFAULT_END_LOCATION = {
  id: 'end',
  name: 'KBS별관',
  lat: '37.517711',
  lng: '126.928294'
};

export const PRESET_LOCATIONS = [
  { name: "여의도역3번출구", lat: "37.522491", lng: "126.923697" },
  { name: "상암 이안오피스텔", lat: "37.577798", lng: "126.890597" },
  { name: "용인대장금파크", lat: "37.121286", lng: "127.336834" },
  { name: "탄현sbs", lat: "37.696796", lng: "126.763634" },
];