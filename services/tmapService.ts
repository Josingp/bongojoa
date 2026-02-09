
import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT, ROUTE_ENDPOINT } from '../constants';
import { Location, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult } from '../types';

const REVERSE_GEO_ENDPOINT = "/geo/reversegeocoding?version=1&addressType=A10&coordType=WGS84GEO";

const formatOptimizationDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  // Date methods (getFullYear, etc) use Local Time.
  // We treat the Date object passed here as the "Wall Clock" time set by the user (already KST initialized in App.tsx)
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
};

const formatTimeDisplay = (date: Date): string => {
  let hour = date.getHours();
  const minute = date.getMinutes();
  const ampm = hour >= 12 ? '오후' : '오전';
  
  // Convert 24h to 12h format
  hour = hour % 12;
  // If hour is 0 (midnight or noon), show as 12
  hour = hour === 0 ? 12 : hour;
  
  return `${ampm} ${hour.toString()}:${minute.toString().padStart(2, '0')}`;
};

/**
 * Standard Routing API (A to B)
 * Updated to support predictive traffic via departureTime
 */
async function fetchStandardRoute(
  apiKey: string,
  start: Location,
  end: Location,
  startTime: Date
): Promise<{data: RouteResponse, duration: number, distance: number}> {
  const cleanKey = apiKey.trim();
  const formattedStartTime = formatOptimizationDate(startTime);

  const payload = {
    startX: start.lng,
    startY: start.lat,
    endX: end.lng,
    endY: end.lat,
    reqCoordType: "WGS84GEO",
    resCoordType: "WGS84GEO",
    searchOption: "0",
    trafficInfo: "Y",
    departureTime: formattedStartTime // Essential for Time Machine feature
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
     throw new Error(`Route API Error (${response.status}): ${errorBody}`);
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
 * Optimization API (Multi-stop)
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
      startTime: formattedStartTime,
      endName: end.name || "도착",
      endX: end.lng,
      endY: end.lat,
      searchOption: "0", // 0: 추천(기본), 2: 최소시간
      viaPoints: viaPoints.map((p, index) => ({
        viaPointId: p.id, // ID를 그대로 전달하여 매칭에 사용
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
  timeMode: 'departure' | 'arrival' = 'departure'
): Promise<OptimizationResult> => {
  
  if (!apiKey) throw new Error("API 키가 설정되지 않았습니다.");

  // Remove milliseconds to prevent slight drift when calculating new dates
  const cleanTargetTime = new Date(targetTime);
  cleanTargetTime.setMilliseconds(0);

  // 경유지가 없는 경우 일반 경로 탐색 (A->B)
  if (viaPoints.length === 0) {
      // [Fix] Pass cleanTargetTime as startTime to standard route for predictive traffic
      const { data, duration, distance } = await fetchStandardRoute(apiKey, start, end, cleanTargetTime);
      
      let actualStartTime = cleanTargetTime;
      if (timeMode === 'arrival') {
        // 도착 희망 시간 - 소요 시간 = 출발해야 하는 시간
        actualStartTime = new Date(cleanTargetTime.getTime() - duration * 1000);
      }
      return processOptimizationResponse(data, start, end, [], actualStartTime, duration, distance);
  }

  // 다중 경유지 최적화 탐색 (A->...->B)
  // API Request Note: If timeMode is 'arrival', we ideally need the duration first to set the startTime correctly.
  // However, optimization depends on startTime for traffic. 
  // For this version, we use the user's input time as the basis for traffic lookup.
  // If arrival mode: We use the input time as "start time" for the API to get the sequence/duration, 
  // then we shift the timeline backwards in `processOptimizationResponse`.
  const { data, duration, distance } = await fetchOptimization(apiKey, start, end, viaPoints, cleanTargetTime);
  
  let actualStartTime = cleanTargetTime;
  if (timeMode === 'arrival') {
    // Shift the entire schedule so that the last point lands on the target time
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
    
    // [중요 수정] 정렬 로직 강화
    const sortedFeatures = [...features].sort((a, b) => {
        const idxA = Number(a.properties.index || 0);
        const idxB = Number(b.properties.index || 0);
        
        if (idxA !== idxB) {
            return idxA - idxB;
        }

        const typeA = a.geometry.type;
        const typeB = b.geometry.type;
        
        if (typeA === 'LineString' && typeB === 'Point') return -1;
        if (typeA === 'Point' && typeB === 'LineString') return 1;
        
        return 0;
    });

    const stops: OptimizedStop[] = [];
    const path: { lat: number; lng: number }[] = [];
    
    // 전체 경로 누적 시간 (초)
    let globalAccumulatedTime = 0;
    // 구간 누적 시간 (초)
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
            coords.forEach(c => path.push({ lat: c[1], lng: c[0] }));
        } 
        else if (feature.geometry.type === 'Point') {
            const coords = feature.geometry.coordinates as number[];
            const pointType = props.pointType;

            // 현재 지점까지의 누적 시간으로 도착 시간 계산
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

            // 1. 출발지
            if (pointType === 'S' || (isFirstPoint && props.index === 0)) {
                stops.push(createStop(start.id, start.name, 'Start', 0));
                segmentAccumulatedTime = 0;
                isFirstPoint = false;
            } 
            // 2. 도착지
            else if (pointType === 'E') {
                 stops.push(createStop(end.id, end.name, 'End', 999));
                 segmentAccumulatedTime = 0;
            } 
            // 3. 경유지
            else if (props.viaPointId || pointType === 'PP') {
                const originalVia = originalViaPoints.find(v => v.id === props.viaPointId);
                const viaName = originalVia?.name || props.viaPointName || `경유지 ${viaSequenceCounter}`;
                const viaId = originalVia?.id || props.viaPointId || `via_${viaSequenceCounter}`;

                stops.push(createStop(
                    viaId,
                    viaName, 
                    'Via', 
                    viaSequenceCounter++
                ));
                segmentAccumulatedTime = 0;
            }
        }
    }
    
    stops.sort((a, b) => a.sequence - b.sequence);
    
    return { stops, summary: { totalDistance, totalDuration }, path };
};
