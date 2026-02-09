
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

// Helper: Display Date Format (e.g. 2월 9일)
const formatDateDisplay = (date: Date): string => {
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
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

// Math Helpers for Coordinate Matching
function deg2rad(deg: number) {
  return deg * (Math.PI/180);
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2-lat1);
  const dLon = deg2rad(lon2-lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat1)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

/**
 * Prediction API (Specific for 'Arrival' time mode or explicitly requested)
 * /routes/prediction supports calculating departure time based on arrival time.
 * Updated to support viaPoints (Waypoints) and Traffic Info.
 */
async function fetchPredictionRoute(
  apiKey: string,
  start: Location,
  end: Location,
  viaPoints: Location[], // Added viaPoints
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
        predictionType: timeMode, 
        predictionTime: formattedTime, 
        
        // 경유지 정보 (wayPoints > wayPoint 배열 구조)
        wayPoints: viaPoints.length > 0 ? {
            wayPoint: viaPoints.map(p => ({
                lon: p.lng,
                lat: p.lat,
            }))
        } : undefined
    },
    searchOption: "00",
    tollgateCarType: "CAR",
    trafficInfo: "Y", 
    totalValue: 1 // CRITICAL: Must be at Root Level for Prediction API to return full features
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
        mode: `Prediction (${timeMode}) with ${viaPoints.length} stops`
      }
  };
}

/**
 * Unified Standard Route API
 * Supports Single & Multi-stop
 * Supports 'departureTime' for Prediction + Traffic Colors
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
    trafficInfo: "Y",  // Ensures congestion colors
    departureTime: formattedStartTime, // Ensures prediction based on time
    totalValue: 1 // CRITICAL: Ensures detailed response including time for each segment
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
        mode: 'Standard Route (Departure Prediction)'
    }
  };
}

/**
 * Optimization API (Reordering)
 * Note: This API often does NOT return congestion info. 
 * We use this ONLY to get the optimal order.
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
      totalValue: 1, // CRITICAL: Ensures detailed response
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

  // 1단계: 순서 최적화 (필요시)
  let orderedViaPoints = [...viaPoints];

  if (useOptimization && viaPoints.length > 0) {
      try {
          const optResponse = await fetchOptimization(apiKey, start, end, viaPoints, cleanTargetTime);
          const features = optResponse.data.features || [];
          
          const newOrder: Location[] = [];
          const visitedIds = new Set<string>();

          for (const f of features) {
              if (f.geometry.type === 'Point' && f.properties.viaPointId) {
                  const pid = f.properties.viaPointId;
                  if (!visitedIds.has(pid)) {
                      const originalPoint = viaPoints.find(vp => vp.id === pid);
                      if (originalPoint) {
                          newOrder.push(originalPoint);
                          visitedIds.add(pid);
                      }
                  }
              }
          }
          
          if (newOrder.length > 0) {
               viaPoints.forEach(vp => {
                   if (!visitedIds.has(vp.id)) newOrder.push(vp);
               });
               orderedViaPoints = newOrder;
          }

      } catch (error) {
          console.warn("Optimization API failed, using original order.", error);
      }
  }

  // 2단계: 실제 경로 데이터 요청 (Traffic Info 포함)
  let responseData: { data: RouteResponse, duration: number, distance: number, debug: DebugInfo };

  if (timeMode === 'arrival') {
      responseData = await fetchPredictionRoute(apiKey, start, end, orderedViaPoints, cleanTargetTime, timeMode);
  } 
  else {
      responseData = await fetchStandardRoute(apiKey, start, end, orderedViaPoints, cleanTargetTime);
  }

  const { data, duration, distance, debug } = responseData;
  
  let actualStartTime = cleanTargetTime;
  
  if (timeMode === 'arrival') {
      actualStartTime = new Date(cleanTargetTime.getTime() - duration * 1000);
  }

  return processOptimizationResponse(
      data, start, end, orderedViaPoints, actualStartTime, duration, distance, debug, timeMode, cleanTargetTime
  );
};

const processOptimizationResponse = (
    data: RouteResponse, 
    start: Location, 
    end: Location, 
    originalViaPoints: Location[], 
    calculatedStartTime: Date,
    apiDuration: number,
    apiDistance: number,
    debugInfo: DebugInfo,
    timeMode: 'departure' | 'arrival' = 'departure',
    targetTime: Date
): OptimizationResult => {
    const totalDistance = apiDistance || Number(data.properties?.totalDistance || 0);
    const totalDuration = apiDuration || Number(data.properties?.totalTime || 0);

    const features = data.features || [];
    
    // Debug Log Collection
    const calculationLogs: string[] = [];
    calculationLogs.push(`=== Calculation Start ===`);
    calculationLogs.push(`Start Time (Calculated): ${calculatedStartTime.toLocaleString()}`);
    calculationLogs.push(`Total Features: ${features.length}`);

    // Feature Sorting Logic
    const indexedFeatures = features.map((f, i) => ({ ...f, _originalIndex: i }));
    
    const sortedFeatures = indexedFeatures.sort((a, b) => {
        const idxA = a.properties.index;
        const idxB = b.properties.index;
        
        const hasIdxA = idxA !== undefined && idxA !== null;
        const hasIdxB = idxB !== undefined && idxB !== null;
        
        if (hasIdxA && hasIdxB) {
            const numA = Number(idxA);
            const numB = Number(idxB);
            
            if (numA !== numB) return numA - numB;
            
            if (a.properties.pointType === 'S') return -1;
            if (b.properties.pointType === 'S') return 1;
            
            const typeA = a.geometry.type;
            const typeB = b.geometry.type;
            if (typeA === 'LineString' && typeB === 'Point') return -1;
            if (typeA === 'Point' && typeB === 'LineString') return 1;
        }
        
        return a._originalIndex - b._originalIndex;
    });

    calculationLogs.push(`Sorted Features: ${sortedFeatures.length}`);

    const stops: OptimizedStop[] = [];
    const fullPath: { lat: number; lng: number }[] = [];
    const segments: RouteSegment[] = [];
    
    let globalAccumulatedTime = 0;
    let lastStopGlobalTime = 0;
    let isFirstPoint = true;
    
    // Track visited via points
    const visitedViaIndices = new Set<number>();

    for (const feature of sortedFeatures) {
        const props = feature.properties;

        if (feature.geometry.type === 'LineString') {
            const segmentTime = Number(props.time || 0);
            globalAccumulatedTime += segmentTime;
            calculationLogs.push(`[LineString] Index: ${props.index}, Time: ${segmentTime}s, New Accum: ${globalAccumulatedTime}s`);
            
            const coords = feature.geometry.coordinates as number[][];
            const segmentPath = coords.map(c => ({ lat: c[1], lng: c[0] }));
            fullPath.push(...segmentPath);

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
            const lat = Number(coords[1]);
            const lng = Number(coords[0]);

            let arrivalDate = new Date(calculatedStartTime.getTime() + Math.round(globalAccumulatedTime) * 1000);
            if (timeMode === 'arrival' && pointType === 'E') {
                arrivalDate = targetTime;
                calculationLogs.push(`[Point] Target Time Reached (Arrival Mode)`);
            }
            const formattedTime = formatTimeDisplay(arrivalDate);

            calculationLogs.push(`[Point] Index: ${props.index}, Type: ${pointType}, AccumTime: ${globalAccumulatedTime}s, Arrival: ${formattedTime}`);

            // 1. Check Start
            if (pointType === 'S' || (isFirstPoint && (props.index === 0 || props.index === undefined))) {
                stops.push({
                    id: start.id,
                    name: start.name,
                    arrivalTime: formattedTime,
                    rawArrivalTime: arrivalDate.toISOString(),
                    type: 'Start',
                    sequence: 0,
                    lat: lat.toString(),
                    lng: lng.toString(),
                    durationFromPrevious: 0
                });
                lastStopGlobalTime = globalAccumulatedTime;
                isFirstPoint = false;
            } 
            // 2. Check End
            else if (pointType === 'E') {
                 const duration = globalAccumulatedTime - lastStopGlobalTime;
                 stops.push({
                    id: end.id,
                    name: end.name,
                    arrivalTime: formattedTime,
                    rawArrivalTime: arrivalDate.toISOString(),
                    type: 'End',
                    sequence: 999,
                    lat: lat.toString(),
                    lng: lng.toString(),
                    durationFromPrevious: duration
                 });
                 lastStopGlobalTime = globalAccumulatedTime;
            } 
            // 3. Check Via
            else {
                let isVia = false;
                let matchedIndex = -1;

                if (props.viaPointId || props.viaPointName || ['P', 'PP', 'Via', 'B1', 'B2', 'B3'].some(t => pointType && pointType.startsWith(t))) {
                     isVia = true;
                }

                // 좌표 기반 매칭
                const foundIndex = originalViaPoints.findIndex((vp, idx) => {
                    if (visitedViaIndices.has(idx)) return false; 
                    const dist = getDistanceFromLatLonInKm(lat, lng, Number(vp.lat), Number(vp.lng));
                    return dist < 0.15; 
                });

                if (foundIndex !== -1) {
                    isVia = true;
                    matchedIndex = foundIndex;
                }

                if (isVia) {
                    let stopName = props.viaPointName;
                    let stopId = props.viaPointId;

                    if (matchedIndex !== -1) {
                        stopName = originalViaPoints[matchedIndex].name;
                        stopId = originalViaPoints[matchedIndex].id;
                        visitedViaIndices.add(matchedIndex);
                    } else {
                        for(let i=0; i<originalViaPoints.length; i++) {
                            if(!visitedViaIndices.has(i)) {
                                stopName = stopName || originalViaPoints[i].name;
                                stopId = stopId || originalViaPoints[i].id;
                                visitedViaIndices.add(i);
                                break;
                            }
                        }
                    }

                    const duration = globalAccumulatedTime - lastStopGlobalTime;
                    calculationLogs.push(`   -> Via Point Added: ${stopName} (+${duration}s from last stop)`);

                    stops.push({
                        id: stopId || `via_${globalAccumulatedTime}`,
                        name: stopName || `경유지`,
                        arrivalTime: formattedTime,
                        rawArrivalTime: arrivalDate.toISOString(),
                        type: 'Via',
                        sequence: 0,
                        lat: lat.toString(),
                        lng: lng.toString(),
                        durationFromPrevious: duration
                    });
                    
                    lastStopGlobalTime = globalAccumulatedTime;
                }
            }
        }
    }
    
    // [버그 수정] Stop 순서 강제 정렬: Start(맨 앞) -> 경유지(시간순) -> End(맨 뒤)
    // 간혹 API가 도착지 점 이후에 경유지 점을 반환하는 경우(데이터 오류)를 방지하기 위함
    stops.sort((a, b) => {
        if (a.type === 'Start') return -1;
        if (b.type === 'Start') return 1;
        if (a.type === 'End') return 1;
        if (b.type === 'End') return -1;
        
        // 시간순 정렬 (Date 객체 변환 비교)
        const timeA = new Date(a.rawArrivalTime).getTime();
        const timeB = new Date(b.rawArrivalTime).getTime();
        return timeA - timeB;
    });

    const finalStops = stops.map((stop, index) => {
        if (stop.type === 'Start') return { ...stop, sequence: 0 };
        if (stop.type === 'End') return { ...stop, sequence: stops.length - 1 };
        // 경유지 시퀀스는 인덱스로 부여
        return { ...stop, sequence: index };
    });
    
    // 타겟 시간 문자열 포맷팅 (예: 2월 9일 오후 6:23)
    const targetDateTimeStr = `${formatDateDisplay(targetTime)} ${formatTimeDisplay(targetTime)}`;

    return { 
        stops: finalStops, 
        summary: { totalDistance, totalDuration }, 
        targetDateTime: targetDateTimeStr,
        path: fullPath,
        segments,
        debug: {
            ...debugInfo,
            calculationLogs,
            rawFeatures: [] // 로그창 제거 요청에 따라 데이터도 비움
        }
    };
};
