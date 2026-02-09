
import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT, ROUTE_ENDPOINT } from '../constants';
import { Location, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult, RouteSegment, DebugInfo } from '../types';

const REVERSE_GEO_ENDPOINT = "/geo/reversegeocoding?version=1&addressType=A10&coordType=WGS84GEO";

// Helper: Format Date to YYYYMMDDHHmm (Common TMAP format)
const formatTmapDateTime = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}${MM}${dd}${hh}${mm}`;
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
const getCongestionColor = (congestion: number | undefined): string => {
  switch (congestion) {
    case 1: return "#10b981"; // Smooth (Green)
    case 2: return "#f59e0b"; // Slow (Orange/Yellow)
    case 3: return "#ef4444"; // Bad (Red)
    case 4: return "#b91c1c"; // Very Bad (Dark Red)
    default: return "#3b82f6"; // No Info (Blue)
  }
};

/**
 * Unified Standard Route API
 * Supports Single Route (A->B) and Sequential Multi-stop (A->Via->B)
 * Supports 'departureTime' for Time Machine prediction + Traffic Info
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

  // Build passList: lng,lat_lng,lat...
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
    trafficInfo: "Y", // CRITICAL: Enables congestion data
    departureTime: formattedStartTime // CRITICAL: Enables prediction
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
        mode: viaPoints.length > 0 ? 'Sequential Route (with Vias)' : 'Single Route'
    }
  };
}

/**
 * Optimization API (Multi-stop Reordering)
 * Uses /routes/routeOptimization10
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
      // Note: Optimization API v1 sometimes doesn't fully support 'trafficInfo' param in the same way 
      // but calculates based on traffic. We add it just in case.
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

  // Decision Logic
  if (useOptimization) {
      // 1. Reordering Requested (Optimization API)
      responseData = await fetchOptimization(apiKey, start, end, viaPoints, cleanTargetTime);
  } else {
      // 2. Sequential / Single Route (Standard Route API)
      // This supports trafficInfo="Y" and departureTime well.
      // If timeMode is 'arrival', we approximate start time by subtracting estimated duration? 
      // Ideally we need an API that supports 'arrival' time. TMAP /routes mainly focuses on departure.
      // For now, we use targetTime as departure time if mode is departure, or we just pass it.
      responseData = await fetchStandardRoute(apiKey, start, end, viaPoints, cleanTargetTime);
  }

  const { data, duration, distance, debug } = responseData;
  
  // Calculate Actual Timestamps
  let actualStartTime = cleanTargetTime;
  if (timeMode === 'arrival') {
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
        
        // Ensure LineString comes before Point if index is same (usually)
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
            segments.push({
              path: segmentPath,
              congestion: props.congestion || 0,
              color: getCongestionColor(props.congestion)
            });
        } 
        else if (feature.geometry.type === 'Point') {
            const coords = feature.geometry.coordinates as number[];
            const pointType = props.pointType; 
            // pointType meanings: S=Start, E=End, B=Branch, P=Pass(Via)

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
            // Detect Via Points: Check for 'P' type, 'Via' type, or existence of viaPointId
            else if (pointType === 'P' || pointType === 'Via' || pointType === 'PP' || props.viaPointId) {
                let viaName = props.viaPointName;
                let viaId = props.viaPointId;

                // Fallback: If API returns generic name, try to match with input via points
                // This is an approximation based on sequence
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
    
    // Sort stops to be safe
    stops.sort((a, b) => a.sequence - b.sequence);
    
    return { 
        stops, 
        summary: { totalDistance, totalDuration }, 
        path: fullPath,
        segments,
        debug: debugInfo
    };
};
