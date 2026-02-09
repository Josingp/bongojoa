
import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT, ROUTE_ENDPOINT } from '../constants';
import { Location, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult } from '../types';

const REVERSE_GEO_ENDPOINT = "/geo/reversegeocoding?version=1&addressType=A10&coordType=WGS84GEO";

const formatOptimizationDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  // Date methods (getFullYear, etc) use Local Time.
  // This matches the user's input context (e.g. KST) when constructed via new Date('YYYY-MM-DDTHH:MM')
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

  // 경유지가 없는 경우 일반 경로 탐색
  if (viaPoints.length === 0) {
      const { data, duration, distance } = await fetchStandardRoute(apiKey, start, end);
      
      let actualStartTime = targetTime;
      if (timeMode === 'arrival') {
        actualStartTime = new Date(targetTime.getTime() - duration * 1000);
      }
      return processOptimizationResponse(data, start, end, [], actualStartTime, duration, distance);
  }

  // 다중 경유지 최적화 탐색
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
    
    // [중요 수정] 정렬 로직 강화
    // 1. 인덱스 순서대로 정렬
    // 2. 인덱스가 같은 경우 LineString(경로)을 Point(지점)보다 우선 처리
    //    이유: 경로 데이터를 먼저 처리해야 이동 시간이 누적된 상태에서 지점 도착 시간을 계산할 수 있음
    const sortedFeatures = [...features].sort((a, b) => {
        const idxA = Number(a.properties.index || 0);
        const idxB = Number(b.properties.index || 0);
        
        if (idxA !== idxB) {
            return idxA - idxB;
        }

        // 인덱스가 같을 때 type 우선순위 비교 (LineString < Point)
        const typeA = a.geometry.type;
        const typeB = b.geometry.type;
        
        if (typeA === 'LineString' && typeB === 'Point') return -1;
        if (typeA === 'Point' && typeB === 'LineString') return 1;
        
        return 0;
    });

    const stops: OptimizedStop[] = [];
    const path: { lat: number; lng: number }[] = [];
    
    // 전체 경로 누적 시간 (초) - 출발지로부터 얼마나 걸리는지
    let globalAccumulatedTime = 0;
    
    // 구간 누적 시간 (초) - 직전 정차지로부터 얼마나 걸리는지
    let segmentAccumulatedTime = 0;
    
    let viaSequenceCounter = 1;
    let isFirstPoint = true;

    for (const feature of sortedFeatures) {
        const props = feature.properties;

        if (feature.geometry.type === 'LineString') {
            // 경로(선) 시간 누적
            // 어떤 경우에 props.time이 문자열일 수 있으므로 안전하게 Number 변환
            const segmentTime = Number(props.time || 0);
            
            globalAccumulatedTime += segmentTime;
            segmentAccumulatedTime += segmentTime;
            
            const coords = feature.geometry.coordinates as number[][];
            coords.forEach(c => path.push({ lat: c[1], lng: c[0] }));
        } 
        else if (feature.geometry.type === 'Point') {
            const coords = feature.geometry.coordinates as number[];
            const pointType = props.pointType; // S: Start, E: End, PP: Via(Pass Point), P: General Point

            // 현재 지점까지의 누적 시간으로 도착 시간 계산
            // Math.round를 사용하여 초 단위 반올림하여 정확도 향상
            const arrivalDate = new Date(calculatedStartTime.getTime() + Math.round(globalAccumulatedTime) * 1000);
            const formattedTime = formatTimeDisplay(arrivalDate);
            
            // 공통 Stop 생성 함수
            const createStop = (id: string, name: string, type: 'Start' | 'Via' | 'End', seq: number): OptimizedStop => ({
                id, 
                name, 
                arrivalTime: formattedTime, 
                rawArrivalTime: arrivalDate.toISOString(),
                type, 
                sequence: seq, 
                lat: coords[1].toString(), 
                lng: coords[0].toString(), 
                // 출발지(0)를 제외하고는 직전 경유지부터 걸린 시간을 기록
                durationFromPrevious: type === 'Start' ? 0 : segmentAccumulatedTime
            });

            // 1. 출발지 (Start)
            if (pointType === 'S' || (isFirstPoint && props.index === 0)) {
                // 출발지는 항상 시작 시간 기준
                stops.push(createStop(start.id, start.name, 'Start', 0));
                segmentAccumulatedTime = 0;
                isFirstPoint = false;
            } 
            // 2. 도착지 (End)
            else if (pointType === 'E') {
                 stops.push(createStop(end.id, end.name, 'End', 999));
                 segmentAccumulatedTime = 0;
            } 
            // 3. 경유지 (Via Points)
            // viaPointId가 일치하거나 pointType이 PP인 경우
            else if (props.viaPointId || pointType === 'PP') {
                // viaPointId가 있는 경우 원본 데이터에서 매칭 시도
                const originalVia = originalViaPoints.find(v => v.id === props.viaPointId);
                
                // 원본을 못 찾으면 API가 준 이름이나 기본 이름 사용
                const viaName = originalVia?.name || props.viaPointName || `경유지 ${viaSequenceCounter}`;
                const viaId = originalVia?.id || props.viaPointId || `via_${viaSequenceCounter}`;

                stops.push(createStop(
                    viaId,
                    viaName, 
                    'Via', 
                    viaSequenceCounter++
                ));
                
                // 해당 지점에 도착했으므로 구간 누적 시간 초기화
                segmentAccumulatedTime = 0;
            }
        }
    }
    
    // 최종 결과 시퀀스 재정렬 (최적화된 순서대로 표시하기 위함)
    stops.sort((a, b) => a.sequence - b.sequence);
    
    return { stops, summary: { totalDistance, totalDuration }, path };
};
