
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

  // 경유지가 없는 경우 일반 경로 탐색
  if (viaPoints.length === 0) {
      const { data, duration, distance } = await fetchStandardRoute(apiKey, start, end);
      
      let actualStartTime = targetTime;
      // 도착 시간 기준이면, 목표 도착 시간에서 총 소요시간을 빼서 출발 시간을 역산
      if (timeMode === 'arrival') {
        actualStartTime = new Date(targetTime.getTime() - duration * 1000);
      }
      return processOptimizationResponse(data, start, end, [], actualStartTime, duration, distance);
  }

  // 다중 경유지 최적화 탐색
  // TMAP API는 기본적으로 출발 시간을 기준으로 교통정보를 반영합니다.
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
    // TMAP GeoJSON: 인덱스 순서대로 정렬하여 처리 (필수)
    const sortedFeatures = [...features].sort((a, b) => Number(a.properties.index || 0) - Number(b.properties.index || 0));

    const stops: OptimizedStop[] = [];
    const path: { lat: number; lng: number }[] = [];
    
    // 전체 경로 누적 시간 (초)
    let globalAccumulatedTime = 0;
    
    // 이전 경유지로부터 현재 경유지까지의 구간 시간 (초)
    let segmentAccumulatedTime = 0;
    
    let viaSequenceCounter = 1;

    for (const feature of sortedFeatures) {
        const props = feature.properties;

        if (feature.geometry.type === 'LineString') {
            // 경로(선)인 경우 시간과 좌표 누적
            const segmentTime = Number(props.time || 0);
            
            globalAccumulatedTime += segmentTime;
            segmentAccumulatedTime += segmentTime;
            
            const coords = feature.geometry.coordinates as number[][];
            coords.forEach(c => path.push({ lat: c[1], lng: c[0] }));
        } 
        else if (feature.geometry.type === 'Point') {
            const coords = feature.geometry.coordinates as number[];
            const pointType = props.pointType; // S: Start, E: End, PP/P: Via

            // 현재 지점의 예상 도착 시간 계산
            const arrivalDate = new Date(calculatedStartTime.getTime() + globalAccumulatedTime * 1000);
            
            const createStop = (id: string, name: string, type: 'Start' | 'Via' | 'End', seq: number): OptimizedStop => ({
                id, 
                name, 
                arrivalTime: formatTimeDisplay(arrivalDate), 
                rawArrivalTime: arrivalDate.toISOString(),
                type, 
                sequence: seq, 
                lat: coords[1].toString(), 
                lng: coords[0].toString(), 
                // 출발지(0)를 제외하고는 직전 경유지부터 걸린 시간을 기록
                durationFromPrevious: type === 'Start' ? 0 : segmentAccumulatedTime
            });

            // 1. 출발지 (Start)
            if (pointType === 'S') {
                stops.push(createStop(start.id, start.name, 'Start', 0));
                // 출발지에서는 구간 시간 초기화
                segmentAccumulatedTime = 0; 
            } 
            // 2. 도착지 (End)
            else if (pointType === 'E') {
                 stops.push(createStop(end.id, end.name, 'End', 999));
                 segmentAccumulatedTime = 0;
            } 
            // 3. 경유지 (Via Points)
            // viaPointId가 있거나 PointType이 PP(Pass Point)인 경우만 유효한 경유지로 처리
            // 단순 교차로(P) 등은 무시
            else if (props.viaPointId || pointType === 'PP') {
                // 원본 경유지 정보 매칭 (이름 복원)
                // viaPointId가 "via_1" 등으로 올 수 있으므로 id 매칭 혹은 순서 매칭
                const originalVia = originalViaPoints.find(v => v.id === props.viaPointId);
                
                // 원본을 못 찾으면 viaSequenceCounter 등을 이용해 추정하거나 API가 준 이름 사용
                const viaName = originalVia?.name || props.viaPointName || `경유지 ${viaSequenceCounter}`;
                
                stops.push(createStop(
                    props.viaPointId || `via_${viaSequenceCounter}`, 
                    viaName, 
                    'Via', 
                    viaSequenceCounter++
                ));
                
                // 경유지를 만났으므로 다음 구간을 위해 구간 시간 초기화
                segmentAccumulatedTime = 0;
            }
        }
    }
    
    // 최종 결과 정렬 (시퀀스 순)
    stops.sort((a, b) => a.sequence - b.sequence);
    
    return { stops, summary: { totalDistance, totalDuration }, path };
};
