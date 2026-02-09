
export interface Location {
  id: string;
  name: string;
  lat: string; // Y coordinate
  lng: string; // X coordinate
  isFixedFirst?: boolean; // New: If true, this point is visited immediately after start
}

// Payload for Route Optimization API
export interface OptimizationRequest {
  reqCoordType: "WGS84GEO";
  resCoordType: "WGS84GEO";
  startName: string;
  startX: string;
  startY: string;
  startTime: string; // YYYYMMDDHHmm
  endName: string;
  endX: string;
  endY: string;
  searchOption: string;
  viaPoints: {
    viaPointId: string;
    viaPointName: string;
    viaX: string;
    viaY: string;
  }[];
}

export interface RouteResponseProperties {
  index: number;
  name?: string;
  description?: string;
  totalDistance?: number;
  totalTime?: number;
  time?: number; // Segment time in seconds
  distance?: number; // Segment distance
  pointType?: 'S' | 'E' | 'P' | 'B' | string; // S: Start, E: End, P: Via
  viaPointId?: string;
  viaPointName?: string;
  congestion?: number; // 0: No info, 1: Smooth, 2: Slow, 3: Congested, 4: Blocked
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point" | "LineString";
    coordinates: number[] | number[][];
  };
  properties: RouteResponseProperties;
}

export interface RouteResponse {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
  properties?: {
    totalDistance?: number;
    totalTime?: number;
    totalFare?: number;
  }
}

export interface OptimizedStop {
  id: string;
  name: string;
  arrivalTime: string; // Formatted HH:MM
  rawArrivalTime: string; // ISO String or similar for calculation
  type: 'Start' | 'Via' | 'End';
  sequence: number;
  lat: string;
  lng: string;
  durationFromPrevious?: number; // Seconds taken to get here from previous stop
  isFixed?: boolean;
}

export interface RouteSegment {
  path: { lat: number; lng: number }[];
  congestion: number; // 0: Unknown, 1: Good, 2: Slow, 3: Bad, 4: Very Bad
  color: string;
}

export interface OptimizationResult {
  stops: OptimizedStop[];
  summary: {
    totalDistance: number; // in meters
    totalDuration: number; // in seconds
  };
  path: { lat: number; lng: number }[]; // Full path for bounds
  segments: RouteSegment[]; // Colored segments for traffic
}

// POI Search Types
export interface PoiItem {
  id: string;
  name: string;
  noorLat: string;
  noorLon: string;
  upperAddrName?: string;
  middleAddrName?: string;
  lowerAddrName?: string;
  detailAddrName?: string;
  firstNo?: string;
  secondNo?: string;
  roadName?: string;
}

export interface PoiResponse {
  searchPoiInfo: {
    totalCount: string;
    count: string;
    page: string;
    pois: {
      poi: PoiItem[];
    };
  };
}