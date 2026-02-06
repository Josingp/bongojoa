// The API Key provided by the user (Reads from Vercel/Vite Environment Variable)
// Try standard Vite env, then process.env (for other setups), then check for NEXT_PUBLIC prefix just in case
export const TMAP_APP_KEY = 
  (import.meta as any).env?.VITE_TMAP_APP_KEY || 
  (process as any).env?.VITE_TMAP_APP_KEY || 
  (process as any).env?.NEXT_PUBLIC_TMAP_APP_KEY ||
  "";

export const TMAP_API_BASE = "https://apis.openapi.sk.com/tmap";

// Route Optimization API Endpoint (Reorders waypoints)
export const OPTIMIZATION_ENDPOINT = "/routes/routeOptimization10?version=1&format=json";

// Standard Route Endpoint (For simple start->end)
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

// Some presets for easy testing since we don't have a geocoder API
export const PRESET_LOCATIONS = [
  { name: "N서울타워", lat: "37.551169", lng: "126.988227" },
  { name: "롯데월드", lat: "37.511115", lng: "127.098167" },
  { name: "경복궁", lat: "37.579617", lng: "126.977041" },
  { name: "홍대입구", lat: "37.557527", lng: "126.924466" },
  { name: "여의도 공원", lat: "37.523850", lng: "126.918917" },
  { name: "이태원", lat: "37.534245", lng: "126.994078" }
];