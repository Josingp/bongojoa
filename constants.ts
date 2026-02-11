
// API Endpoints (Local Serverless Functions)
export const API_BASE = "/api";

export const OPTIMIZATION_ENDPOINT = "/tmap/optimize";
export const ROUTE_PREDICTION_ENDPOINT = "/tmap/prediction";
export const POI_SEARCH_ENDPOINT = "/tmap/poi";
export const REVERSE_GEO_ENDPOINT = "/tmap/geo";
export const OPINET_ENDPOINT = "/opinet";

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
