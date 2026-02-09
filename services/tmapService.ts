
import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT, ROUTE_ENDPOINT } from '../constants';
import { Location, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult, RouteSegment } from '../types';

const REVERSE_GEO_ENDPOINT = "/geo/reversegeocoding?version=1&addressType=A10&coordType=WGS84GEO";
const PREDICTION_ENDPOINT = "/routes/prediction?version=1&format=json";

// Helper: Format Date to YYYYMMDDHHmm (for Optimization API)
const formatOptimizationDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
};

// Helper: Format Date to ISO-8601 with +0900 offset (for Prediction API)
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
 * Prediction Routing API (A to B with Time Machine)
 */
async function fetchPredictionRoute(
  apiKey: string,
  start: Location,
  end: Location,
  targetTime: Date,
  timeMode: 'departure' | 'arrival'
): Promise<{data: RouteResponse, duration: number, distance: number}> {
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
        predictionType: timeMode, 
        predictionTime: formattedTime 
    }
  };

  const response = await fetch(`${TMAP_API_BASE}${PREDICTION_ENDPOINT}`, {
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
  
  return { data, duration, distance };
}

/**
 * Sequential Routing with Waypoints (Time Machine enabled via departureTime)
 * Uses standard /routes endpoint with passList
 */
async function fetchSequentialRoute(
  apiKey: string,
  start: Location,
  end: Location,
  viaPoints: Location[],
  startTime: Date
): Promise<{data: RouteResponse, duration: number, distance: number}> {
  const cleanKey = apiKey.trim();
  const formattedStartTime = formatIsoDateKST(startTime);

  // Build passList: lng,lat_lng,lat...
  const passList = viaPoints.map(p => `${p.lng},${p.lat}`).join("_");

  // For standard /routes, departureTime format is typically ISO or specialized.
  // v1 docs say 'departureTime' or 'planTime' support. 
  // Using ISO format usually works for prediction contexts in TMAP if trafficInfo is Y.
  
  const payload = {
    startX: start.lng,
    startY: start.lat,
    endX: end.lng,
    endY: end.lat,
    passList: passList,
    reqCoordType: "WGS84GEO",
    resCoordType: "WGS84GEO",
    searchOption: "0",
    trafficInfo: "Y", // Essential for congestion
    departureTime: formattedStartTime
  };

  const response = await fetch(`${TMAP_API_BASE}${ROUTE_ENDPOINT}`, {
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
     throw new Error(`Sequential Route API Error (${response.status}): ${errorBody}`);
  }

  const data: RouteResponse = await response.json();
  let distance = 0;
  let duration = 0;
  
  if (data.features && data.features.length > 0) {
      distance = Number(data.features[0].properties.totalDistance || 0);
      duration = Number(data.features[0].properties.totalTime || 0);
  }
  
  return { data, duration, distance };
}

/**
 * Optimization API (Multi-stop Reordering)
 */
async function fetchOptimization(
    apiKey: string,
    start: Location,
    end: Location,
    viaPoints: Location[],
    startTime: Date
): Promise<{data: RouteResponse, duration: number, distance: number}> {
    const cleanKey = apiKey.trim();
    const formattedStartTime = formatOptimizationDate(startTime);
    
    const payload = {
      reqCoordType: "WGS84GEO",
      resCoordType: "WGS84GEO",
      startName: start.name || "출발",
      startX: start.lng,
      startY: start.lat,
      startTime: formattedStartTime, // YYYYMMDDHHmm
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

    const response = await fetch(`${TMAP_API_BASE}${OPTIMIZATION_ENDPOINT}`, {
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

    return { data, duration, distance };
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

  // CASE 1: Single Route (A -> B)
  // Use /routes/prediction for accurate Time Machine features
  if (viaPoints.length === 0) {
      const { data, duration, distance } = await fetchPredictionRoute(apiKey, start, end, cleanTargetTime, timeMode);
      
      let actualStartTime = cleanTargetTime;
      if (timeMode === 'arrival') {
        actualStartTime = new Date(cleanTargetTime.getTime() - duration * 1000);
      }

      return processOptimizationResponse(data, start, end, [], actualStartTime, duration, distance);
  }

  // CASE 2: Multi-Stop Routes
  let responseData: { data: RouteResponse, duration: number, distance: number };
  
  // Decide between Optimization API (reordering) or Sequential API (passList)
  if (useOptimization) {
     // User specifically requested optimization (reordering)
     responseData = await fetchOptimization(apiKey, start, end, viaPoints, cleanTargetTime);
  } else {
     // User wants to visit in entered order
     // Note: If timeMode is 'arrival', we need to approximate. Sequential API mainly takes departure.
     // We will use targetTime as departure time for simplicity in sequential logic unless we implemented a complex backward search.
     let seqStartTime = cleanTargetTime;
     if (timeMode === 'arrival') {
         // Warn: Exact arrival time calc for sequential stops is complex without API support. 
         // We'll proceed with targetTime as start for traffic estimation.
     }
     responseData = await fetchSequentialRoute(apiKey, start, end, viaPoints, seqStartTime);
  }

  const { data, duration, distance } = responseData;
  
  let actualStartTime = cleanTargetTime;
  if (timeMode === 'arrival') {
    actualStartTime = new Date(cleanTargetTime.getTime() - duration * 1000);
  }

  return processOptimizationResponse(data, start, end, viaPoints, actualStartTime, duration, distance);
};

const processOptimizationResponse = (
    data: RouteResponse, 
    start: Location, 
    end: Location, 
    originalViaPoints: Location[], 
    calculatedStartTime: Date,
    apiDuration: number,
    apiDistance: number
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

    // We process features linearly
    for (const feature of sortedFeatures) {
        const props = feature.properties;

        if (feature.geometry.type === 'LineString') {
            const segmentTime = Number(props.time || 0);
            globalAccumulatedTime += segmentTime;
            segmentAccumulatedTime += segmentTime;
            
            const coords = feature.geometry.coordinates as number[][];
            const segmentPath = coords.map(c => ({ lat: c[1], lng: c[0] }));
            
            // Add to full path for bounds
            fullPath.push(...segmentPath);

            // Create Traffic Segment
            segments.push({
              path: segmentPath,
              congestion: props.congestion || 0,
              color: getCongestionColor(props.congestion)
            });
        } 
        else if (feature.geometry.type === 'Point') {
            const coords = feature.geometry.coordinates as number[];
            const pointType = props.pointType;

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
            // Handle Via Points. 
            // In optimization API, pointType is often 'S', 'E' or 'P'.
            // In standard API, pointType might be 'S', 'E', 'B' (Branch?), 'P' (Pass?).
            // We assume if it has viaPointId OR if it's 'via', it's a stop.
            else if (props.viaPointId || pointType === 'PP' || (pointType !== 'S' && pointType !== 'E' && pointType !== 'B')) {
                // If it's a Via point (Point Type PP usually)
                // For sequential routes, props might not have viaPointId, we must match by logic or sequence if possible
                
                // Fallback name logic
                let viaName = props.viaPointName;
                let viaId = props.viaPointId;

                // If API didn't return specific via ID (common in sequential), try to match from original list by distance or order?
                // For simplicity here, we create a generic via stop if valid.
                if (!viaName && originalViaPoints.length > 0) {
                   // This is rough approximation if API doesn't return ID. 
                   // Ideally Route Optimization API returns IDs. Sequential might not.
                   if (originalViaPoints[viaSequenceCounter - 1]) {
                      viaName = originalViaPoints[viaSequenceCounter - 1].name;
                      viaId = originalViaPoints[viaSequenceCounter - 1].id;
                   }
                }
                
                // Only add if it seems to be a real stop (not just a turn point)
                // 'Point' features in TMAP are usually guidance points.
                // We strictly look for 'viaPointId' or explicit 'PP' types from Optimization response.
                // For Sequential, we might need to rely on 'PointType' being something specific.
                // NOTE: In standard TMAP /routes, Waypoints are often not explicitly returned as "Stop" features with arrival times 
                // in the same structure as Optimization API. 
                // However, we will attempt to render it.
                if (props.viaPointId || pointType === 'PP' || pointType === 'Via') {
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
    
    // Safety for Sequential: If stops doesn't contain all via points (common in Standard API), 
    // we might need to forcefully insert them based on geometry? 
    // For now, we trust the API returns 'via' type points or we accept only Start/End for visual timeline in sequential if API lacks data.
    // (Optimization API is robust for this, Standard /routes prediction might just give path)
    
    stops.sort((a, b) => a.sequence - b.sequence);
    
    return { 
        stops, 
        summary: { totalDistance, totalDuration }, 
        path: fullPath,
        segments 
    };
};
