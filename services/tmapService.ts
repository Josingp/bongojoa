
import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT, ROUTE_ENDPOINT } from '../constants';
import { Location, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult } from '../types';

const REVERSE_GEO_ENDPOINT = "/geo/reversegeocoding?version=1&addressType=A10&coordType=WGS84GEO";

const formatOptimizationDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
};

const formatTimeDisplay = (date: Date): string => {
  let hour = date.getHours();
  const minute = date.getMinutes();
  const ampm = hour >= 12 ? '오후' : '오전';
  hour = hour % 12 || 12;
  return `${ampm} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
};

/**
 * Standard Routing API (A to B)
 */
async function fetchStandardRoute(
  apiKey: string,
  start: Location,
  end: Location
): Promise<{data: RouteResponse, duration: number, distance: number}> {
  const cleanKey = apiKey.trim();
  const payload = {
    startX: start.lng,
    startY: start.lat,
    endX: end.lng,
    endY: end.lat,
    reqCoordType: "WGS84GEO",
    resCoordType: "WGS84GEO",
    searchOption: "0",
    trafficInfo: "Y"
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
      searchOption: "0",
      viaPoints: viaPoints.map((p, index) => ({
        viaPointId: p.id || `via_${index}`,
        viaPointName: p.name || `경유지_${index + 1}`,
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

  if (viaPoints.length === 0) {
      const { data, duration, distance } = await fetchStandardRoute(apiKey, start, end);
      // For Arrival mode, we subtract total duration from target arrival time to get the actual start time
      let actualStartTime = targetTime;
      if (timeMode === 'arrival') {
        actualStartTime = new Date(targetTime.getTime() - duration * 1000);
      }
      return processOptimizationResponse(data, start, end, [], actualStartTime, duration, distance);
  }

  // First call to get total duration for arrival mode offset
  // Note: TMAP routeOptimization30 needs a startTime for traffic data. 
  // If in arrival mode, we use targetTime as a proxy first.
  const { data, duration, distance } = await fetchOptimization(apiKey, start, end, viaPoints, targetTime);
  
  let actualStartTime = targetTime;
  if (timeMode === 'arrival') {
    actualStartTime = new Date(targetTime.getTime() - duration * 1000);
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
    // TMAP GeoJSON: Features are usually ordered by index. 
    // index 0 is typically the start point or summary.
    const sortedFeatures = [...features].sort((a, b) => (a.properties.index || 0) - (b.properties.index || 0));

    const stops: OptimizedStop[] = [];
    const path: { lat: number; lng: number }[] = [];
    let currentAccumulatedTime = 0;
    let currentSegmentTime = 0;
    let viaSequenceCounter = 1;

    for (const feature of sortedFeatures) {
        if (feature.geometry.type === 'LineString') {
            const segmentTime = Number(feature.properties.time || 0);
            currentAccumulatedTime += segmentTime;
            currentSegmentTime += segmentTime;
            
            const coords = feature.geometry.coordinates as number[][];
            coords.forEach(c => path.push({ lat: c[1], lng: c[0] }));
        } else if (feature.geometry.type === 'Point') {
            const props = feature.properties;
            const coords = feature.geometry.coordinates as number[];
            
            // Calculate specific arrival time for this point
            let arrivalDate = new Date(calculatedStartTime.getTime() + currentAccumulatedTime * 1000);
            
            // Point types: S(Start), E(End), P(Point/Waypoint)
            if (props.pointType === 'S') { 
              arrivalDate = calculatedStartTime;
              // Reset accumulated time just in case, though it should be 0 at start
              currentAccumulatedTime = 0; 
            } else if (props.pointType === 'E') { 
              // Final destination should always match totalDuration exactly
              arrivalDate = new Date(calculatedStartTime.getTime() + totalDuration * 1000); 
            }

            const createStop = (id: string, name: string, type: 'Start' | 'Via' | 'End', seq: number): OptimizedStop => ({
                id, name, 
                arrivalTime: formatTimeDisplay(arrivalDate), 
                rawArrivalTime: arrivalDate.toISOString(),
                type, 
                sequence: seq, 
                lat: coords[1].toString(), 
                lng: coords[0].toString(), 
                durationFromPrevious: type === 'Start' ? 0 : currentSegmentTime
            });

            if (props.pointType === 'S') {
                stops.push(createStop(start.id, start.name, 'Start', 0));
                currentSegmentTime = 0;
            } else if (props.pointType === 'E') {
                 stops.push(createStop(end.id, end.name, 'End', 999));
                 currentSegmentTime = 0;
            } else if (props.viaPointId || props.pointType === 'P' || props.pointType === 'PP') {
                // Find matching original via point for the correct name
                const originalVia = originalViaPoints.find(v => v.id === props.viaPointId);
                const viaName = originalVia?.name || props.viaPointName || `경유지 ${viaSequenceCounter}`;
                stops.push(createStop(props.viaPointId || `via_${viaSequenceCounter}`, viaName, 'Via', viaSequenceCounter++));
                currentSegmentTime = 0;
            }
        }
    }
    
    // Sort stops by their encounter sequence in the optimized route
    // The counter 'viaSequenceCounter' already ensures the optimized order
    stops.sort((a, b) => a.sequence - b.sequence);
    
    return { stops, summary: { totalDistance, totalDuration }, path };
};
