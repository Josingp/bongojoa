
// TMAP API Key from Environment Variable
// Try multiple sources to ensure compatibility with various build environments (Vite, Vercel, etc.)
export const TMAP_APP_KEY = 
  (import.meta as any).env?.VITE_TMAP_APP_KEY || 
  (process.env as any).VITE_TMAP_APP_KEY || 
  "";

export const TMAP_API_BASE = "https://apis.openapi.sk.com/tmap";

// Route Optimization API Endpoint (Using version 30 as per reference example)
export const OPTIMIZATION_ENDPOINT = "/routes/routeOptimization30?version=1&format=json";

// Standard Route Endpoint
export const ROUTE_ENDPOINT = "/routes?version=1&format=json";

// POI Search Endpoint
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
