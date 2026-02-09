
import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT, ROUTE_ENDPOINT } from '../constants';
import { Location, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult, RouteSegment, DebugInfo } from '../types';

const REVERSE_GEO_ENDPOINT = "/geo/reversegeocoding?version=1&addressType=A10&coordType=WGS84GEO";
const PREDICTION_ENDPOINT = "/routes/prediction?version=1&format=json";

// Helper: Format Date to YYYYMMDDHHmm (Standard TMAP format for /routes)
const formatTmapDateTime = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}${MM}${dd}${hh}${mm}`;
};

// Helper: Format Date to ISO-8601 with +0900 (For Prediction API)
// Example: 2022-09-10T09:00:22+0900
const formatIsoDateKST = (date: Date): string => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}+0900`;
};

const formatTimeDisplay = (date: Date): string => {
  let hour = date.getHours();
  const minute = date.getMinutes();
  const ampm = hour >= 12 ? '오후' : '오전';
  
  hour = hour % 12;
  hour = hour === 0 ? 12 : hour;
  
  return `${ampm} ${hour.toString()}:${minute.toString().padStart(2, '0')}`;
};

// Traffic Color Mapper
const getCongestionColor = (congestion: number | string | undefined): string => {
  const c = Number(congestion);
  switch (c) {
    case 1: return "#10b981"; // Smooth (Green)
    case 2: return "#f59e0b"; // Slow (Orange/Yellow)
    case 3: return "#ef4444"; // Bad (Red)
    case 4: return "#b91c1c"; // Very Bad (Dark Red)
    default: return "#3b82f6"; // No Info (Blue)
  }
};

/**
 * Prediction API (Specific for Single Route A->B with Time Machine)
 * Uses /routes/prediction with ISO format
 */
async function fetchPredictionRoute(
  apiKey: string,
  start: Location,
  end: Location,
  targetTime: Date,
  timeMode: 'departure' | 'arrival'
): Promise<{data: RouteResponse, duration: number, distance: number, debug: DebugInfo}> {
  const cleanKey = apiKey.trim();
  const formattedTime = formatIsoDateKST(targetTime);

  const payload = {
    routesInfo: {
        departure: {
            name: start.name || "출발지",
            lon: start.lng,
            lat: start.lat
        },
        destination: {
            name: end.name || "도착지",
            lon: end.lng,
            lat: end.lat
        },
        predictionType: timeMode, // 'departure' or 'arrival'
        predictionTime: formattedTime // Must be ISO-8601 with +0900
    }
  };

  const url = `${TMAP_API_BASE}${PREDICTION_ENDPOINT}`;

  const response = await fetch(url, {
      method: 'POST',
      headers: {
        'appKey': cleanKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
  });

  if (!response.ok) {
     const errorBody = await response.text();
     throw new Error(`Prediction API Error (${response.status}): ${errorBody}`);
  }

  const data: RouteResponse = await response.json();
  let distance = 0;
  let duration = 0;
  
  if (data.features && data.features.length > 0) {
      distance = Number(data.features[0].properties.totalDistance || 0);
      duration = Number(data.features[0].properties.totalTime || 0);
  }
  
  return { 
      data, duration, distance,
      debug: {
        requestUrl: url,
        requestPayload: payload,
        timestamp: new Date().toISOString(),
        mode: `Prediction (${timeMode})`
      }
  };
}

/**
 * Unified Standard Route API (For Multi-stop)
 * Uses /routes with YYYYMMDDHHmm format
 */
async function fetchStandardRoute(
  apiKey: string,
  start: Location,
  end: Location,
  viaPoints: Location[],
  startTime: Date
): Promise<{data: RouteResponse, duration: number, distance: number, debug: DebugInfo}> {
  const cleanKey = apiKey.trim();
  const formattedStartTime = formatTmapDateTime(startTime);

  const passList = viaPoints.length > 0 
    ? viaPoints.map(p => `${p.lng},${p.lat}`).join("_") 
    : undefined;
  
  const payload = {
    startX: start.lng,
    startY: start.lat,
    endX: end.lng,
    endY: end.lat,
    passList: passList,
    reqCoordType: "WGS84GEO",
    resCoordType: "WGS84GEO",
    searchOption: "0",
    trafficInfo: "Y", 
    departureTime: formattedStartTime 
  };

  const url = `${TMAP_API_BASE}${ROUTE_ENDPOINT}`;

  const response = await fetch(url, {
      method: 'POST',
      headers: {
        'appKey': cleanKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
  });

  if (!response.ok) {
     const errorBody = await response.text();
     throw new Error(`Route API Error (${response.status}): ${errorBody}`);
  }

  const data: RouteResponse = await response.json();
  let distance = 0;
  let duration = 0;
  
  if (data.features && data.features.length > 0) {
      distance = Number(data.features[0].properties.totalDistance || 0);
      duration = Number(data.features[0].properties.totalTime || 0);
  }
  
  return { 
    data, 
    duration, 
    distance,
    debug: {
        requestUrl: url,
        requestPayload: payload,
        timestamp: new Date().toISOString(),
        mode: 'Standard Route (Sequential)'
    }
  };
}

/**
 * Optimization API (Reordering)
 */
async function fetchOptimization(
    apiKey: string,
    start: Location,
    end: Location,
    viaPoints: Location[],
    startTime: Date
): Promise<{data: RouteResponse, duration: number, distance: number, debug: DebugInfo}> {
    const cleanKey = apiKey.trim();
    const formattedStartTime = formatTmapDateTime(startTime);
    
    const payload = {
      reqCoordType: "WGS84GEO",
      resCoordType: "WGS84GEO",
      startName: start.name || "출발",
      startX: start.lng,
      startY: start.lat,
      startTime: formattedStartTime,
      endName: end.name || "도착",
      endX: end.lng,
      endY: end.lat,
      searchOption: "0",
      viaPoints: viaPoints.map((p, index) => ({
        viaPointId: p.id,
        viaPointName: p.name || `경유지 ${index + 1}`,
        viaX: p.lng,
        viaY: p.lat
      }))
    };

    const url = `${TMAP_API_BASE}${OPTIMIZATION_ENDPOINT}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'appKey': cleanKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Optimization API Error (${response.status}): ${errorBody}`);
    }

    const data: RouteResponse = await response.json();
    let distance = 0;
    let duration = 0;

    if (data.properties) {
        distance = Number(data.properties.totalDistance || 0);
        duration = Number(data.properties.totalTime || 0);
    } 
    
    if (distance === 0 && data.features && data.features.length > 0) {
        const firstProp = data.features[0].properties;
        distance = Number(firstProp.totalDistance || 0);
        duration = Number(firstProp.totalTime || 0);
    }

    return { 
        data, 
        duration, 
        distance,
        debug: {
            requestUrl: url,
            requestPayload: payload,
            timestamp: new Date().toISOString(),
            mode: 'Optimization (Reorder)'
        }
    };
}

export const getAddressFromCoords = async (apiKey: string, lat: number, lng: number): Promise<string> => {
  const cleanKey = apiKey.trim();
  const url = `${TMAP_API_BASE}${REVERSE_GEO_ENDPOINT}&lat=${lat}&lon=${lng}&appKey=${cleanKey}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'appKey': cleanKey, 'Accept': 'application/json' }
    });
    if (!response.ok) return "선택된 위치";
    const data = await response.json();
    return data.addressInfo?.fullAddress || "알 수 없는 위치";
  } catch (e) {
    return "위치 정보 불러오기 실패";
  }
};

export const searchPois = async (apiKey: string, keyword: string): Promise<PoiItem[]> => {
  const cleanKey = apiKey.trim();
  const url = `${TMAP_API_BASE}${POI_SEARCH_ENDPOINT}&searchKeyword=${encodeURIComponent(keyword)}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=20&appKey=${cleanKey}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'appKey': cleanKey, 'Accept': 'application/json' }
    });
    if (!response.ok) return [];
    const data: PoiResponse = await response.json();
    return data.searchPoiInfo?.pois?.poi || [];
  } catch (error) {
    return [];
  }
};

export const optimizeRoute = async (
  apiKey: string,
  start: Location,
  end: Location,
  viaPoints: Location[],
  targetTime: Date,
  timeMode: 'departure' | 'arrival' = 'departure',
  useOptimization: boolean = false
): Promise<OptimizationResult> => {
  
  if (!apiKey) throw new Error("API 키가 설정되지 않았습니다.");

  const cleanTargetTime = new Date(targetTime);
  cleanTargetTime.setMilliseconds(0);

  let responseData: { data: RouteResponse, duration: number, distance: number, debug: DebugInfo };
  let usedTimeMode = timeMode;

  // Decision Logic
  if (viaPoints.length === 0) {
      // 1. Single Route (A -> B) -> Use PREDICTION API
      // This supports predictionType (arrival/departure) natively
      responseData = await fetchPredictionRoute(apiKey, start, end, cleanTargetTime, timeMode);
  } 
  else if (useOptimization) {
      // 2. Multi-stop Reorder -> Optimization API
      // Optimization API mainly supports 'departure' time. Arrival time logic needs manual calc.
      responseData = await fetchOptimization(apiKey, start, end, viaPoints, cleanTargetTime);
  } 
  else {
      // 3. Multi-stop Sequential -> Standard Route API
      // Standard API only supports 'departureTime'.
      // If user selected 'arrival', we approximate or just pass it as departure for traffic query.
      responseData = await fetchStandardRoute(apiKey, start, end, viaPoints, cleanTargetTime);
  }

  const { data, duration, distance, debug } = responseData;
  
  // Calculate Actual Timestamps for display
  // If we used Prediction API with 'arrival' mode, the API calculated the departure time for us implicitly?
  // Prediction API usually returns route features.
  let actualStartTime = cleanTargetTime;
  
  if (timeMode === 'arrival') {
      // If we used Prediction API, it might have respected arrival time.
      // We assume the trip ends at cleanTargetTime.
      actualStartTime = new Date(cleanTargetTime.getTime() - duration * 1000);
  }

  return processOptimizationResponse(data, start, end, viaPoints, actualStartTime, duration, distance, debug);
};

const processOptimizationResponse = (
    data: RouteResponse, 
    start: Location, 
    end: Location, 
    originalViaPoints: Location[], 
    calculatedStartTime: Date,
    apiDuration: number,
    apiDistance: number,
    debugInfo: DebugInfo
): OptimizationResult => {
    const totalDistance = apiDistance || Number(data.properties?.totalDistance || 0);
    const totalDuration = apiDuration || Number(data.properties?.totalTime || 0);

    const features = data.features || [];
    
    // Sort features
    const sortedFeatures = [...features].sort((a, b) => {
        const idxA = Number(a.properties.index || 0);
        const idxB = Number(b.properties.index || 0);
        
        if (idxA !== idxB) return idxA - idxB;

        const typeA = a.geometry.type;
        const typeB = b.geometry.type;
        
        if (typeA === 'LineString' && typeB === 'Point') return -1;
        if (typeA === 'Point' && typeB === 'LineString') return 1;
        return 0;
    });

    const stops: OptimizedStop[] = [];
    const fullPath: { lat: number; lng: number }[] = [];
    const segments: RouteSegment[] = [];
    
    let globalAccumulatedTime = 0;
    let segmentAccumulatedTime = 0;
    let viaSequenceCounter = 1;
    let isFirstPoint = true;

    for (const feature of sortedFeatures) {
        const props = feature.properties;

        if (feature.geometry.type === 'LineString') {
            const segmentTime = Number(props.time || 0);
            globalAccumulatedTime += segmentTime;
            segmentAccumulatedTime += segmentTime;
            
            const coords = feature.geometry.coordinates as number[][];
            const segmentPath = coords.map(c => ({ lat: c[1], lng: c[0] }));
            
            fullPath.push(...segmentPath);

            // Add Traffic Segment
            // Safely parse congestion (API sometimes returns string "1")
            const congestionVal = Number(props.congestion);
            segments.push({
              path: segmentPath,
              congestion: isNaN(congestionVal) ? 0 : congestionVal,
              color: getCongestionColor(congestionVal)
            });
        } 
        else if (feature.geometry.type === 'Point') {
            const coords = feature.geometry.coordinates as number[];
            const pointType = props.pointType; 
            // pointType: S(Start), E(End), P(Pass/Via), B(Break/Turn?), or sometimes specific strings

            const arrivalDate = new Date(calculatedStartTime.getTime() + Math.round(globalAccumulatedTime) * 1000);
            const formattedTime = formatTimeDisplay(arrivalDate);
            
            const createStop = (id: string, name: string, type: 'Start' | 'Via' | 'End', seq: number): OptimizedStop => ({
                id, 
                name, 
                arrivalTime: formattedTime, 
                rawArrivalTime: arrivalDate.toISOString(),
                type, 
                sequence: seq, 
                lat: coords[1].toString(), 
                lng: coords[0].toString(), 
                durationFromPrevious: type === 'Start' ? 0 : segmentAccumulatedTime
            });

            if (pointType === 'S' || (isFirstPoint && props.index === 0)) {
                stops.push(createStop(start.id, start.name, 'Start', 0));
                segmentAccumulatedTime = 0;
                isFirstPoint = false;
            } 
            else if (pointType === 'E') {
                 stops.push(createStop(end.id, end.name, 'End', 999));
                 segmentAccumulatedTime = 0;
            } 
            else {
                // Determine if this Point is a Via Point
                // Strict check: pointType 'P', 'Via', 'PP'
                // Loose check: If we have viaPoints input, and this is NOT S/E/B, treat as via?
                // TMAP sometimes marks turns as Points. We must be careful.
                // Usually TMAP /routes via points have 'viaPointId' property.
                
                const isExplicitVia = props.viaPointId || pointType === 'P' || pointType === 'Via' || pointType === 'PP';
                
                // If explicit or matches input count logic
                if (isExplicitVia) {
                    let viaName = props.viaPointName;
                    let viaId = props.viaPointId;

                    // Fallback name matching by order
                    if (!viaName && originalViaPoints.length > 0) {
                        if (originalViaPoints[viaSequenceCounter - 1]) {
                            viaName = originalViaPoints[viaSequenceCounter - 1].name;
                            viaId = originalViaPoints[viaSequenceCounter - 1].id;
                        }
                    }

                    stops.push(createStop(
                        viaId || `via_${viaSequenceCounter}`,
                        viaName || `경유지 ${viaSequenceCounter}`, 
                        'Via', 
                        viaSequenceCounter++
                    ));
                    segmentAccumulatedTime = 0;
                }
            }
        }
    }
    
    // Fallback: If via points were requested but NOT found in features (common in Prediction/Standard API quirks),
    // we should forcefully insert them for UI consistency if possible, or at least warn?
    // For now, we trust the API feature list.
    
    stops.sort((a, b) => a.sequence - b.sequence);
    
    return { 
        stops, 
        summary: { totalDistance, totalDuration }, 
        path: fullPath,
        segments,
        debug: debugInfo
    };
};
