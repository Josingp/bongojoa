
// TMAP API 키 가져오기
// Vite 환경에서는 환경변수 이름이 반드시 'VITE_'로 시작해야 합니다.

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

  // 2. process.env 확인 (Node.js/Vercel 호환 및 일부 빌드 환경)
  if (!key && typeof process !== 'undefined' && process.env) {
    key = process.env.VITE_TMAP_APP_KEY || process.env.TMAP_APP_KEY || "";
  }

  return key.trim();
};

export const TMAP_APP_KEY = getApiKey();

// [중요] 디버깅용 로그: 브라우저 콘솔(F12)을 확인하세요.
if (typeof window !== 'undefined') {
  if (TMAP_APP_KEY) {
    console.log("%c[TMAP Key Loaded] %c성공", "color: blue; font-weight: bold", "color: green");
  } else {
    console.error(`
      [TMAP API Key Error] 키를 찾을 수 없습니다.
      
      Vercel 배포 시 해결 방법:
      1. Vercel 대시보드 > Project Settings > Environment Variables 이동
      2. Key: VITE_TMAP_APP_KEY (반드시 VITE_ 접두사 필요)
      3. Value: 발급받은 TMAP App Key 입력
      4. 저장 후 반드시 'Redeploy' 해야 적용됩니다.
    `);
  }
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
