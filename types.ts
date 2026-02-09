
export interface Location {
  id: string;
  name: string;
  lat: string; // Y coordinate
  lng: string; // X coordinate
  isFixedFirst?: boolean; // If true, this point is visited immediately after start
  stayTime?: number; // Stay duration in minutes
}

export type FuelType = 'GASOLINE' | 'DIESEL';

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
  totalFare?: number; // Toll
  taxiFare?: number;
  fuelPrice?: number;
  time?: number; // Segment time in seconds
  distance?: number; // Segment distance
  pointType?: 'S' | 'E' | 'P' | 'B' | string; // S: Start, E: End, P: Via/Pass
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
    taxiFare?: number;
    fuelPrice?: number;
  }
}

export interface OptimizedStop {
  id: string;
  name: string;
  arrivalTime: string; // Formatted HH:MM
  departureTime?: string; // Formatted HH:MM (Arrival + Stay)
  rawArrivalTime: string; // ISO String
  type: 'Start' | 'Via' | 'End';
  sequence: number;
  lat: string;
  lng: string;
  durationFromPrevious?: number; // Seconds
  stayTime?: number; // Minutes
  isFixed?: boolean;
}

export interface RouteSegment {
  path: { lat: number; lng: number }[];
  congestion: number; // 0: Unknown, 1: Good, 2: Slow, 3: Bad, 4: Very Bad
  color: string;
}

export interface DebugInfo {
  requestUrl: string;
  requestPayload: any;
  timestamp: string;
  mode: string;
  calculationLogs?: string[]; // Log calculation steps
  rawFeatures?: any[]; // Simplified features for debugging
}

export interface OptimizationResult {
  stops: OptimizedStop[];
  summary: {
    totalDistance: number; // in meters
    totalDuration: number; // in seconds
    fares?: {
      toll: number;
      taxi: number;
      fuel: number; // API value
    }
  };
  targetDateTime?: string; // Formatted string for UI display (e.g., "2월 9일 오후 6:23")
  path: { lat: number; lng: number }[]; // Full path for bounds
  segments: RouteSegment[]; // Colored segments for traffic
  debug: DebugInfo; // New debug info field
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
