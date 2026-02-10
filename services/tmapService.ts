import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT, ROUTE_ENDPOINT } from '../constants';
import { Location, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult, RouteSegment, DebugInfo } from '../types';

const REVERSE_GEO_ENDPOINT = "/geo/reversegeocoding?version=1&addressType=A10&coordType=WGS84GEO";
const PREDICTION_ENDPOINT = "/routes/prediction?version=1&format=json";

/** 타임존 왜곡 방지: 사용자가 입력한 “로컬 시각”에 +0900 고정 부착 */
const formatIsoStringKST = (date: Date): string => {
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

const formatDateDisplay = (date: Date): string => {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

const getCongestionColor = (congestion: number | string | undefined): string => {
  const c = Number(congestion);
  switch (c) {
    case 1: return "#10b981";
    case 2: return "#f59e0b";
    case 3: return "#ef4444";
    case 4: return "#b91c1c";
    default: return "#3b82f6";
  }
};

function deg2rad(deg: number) { return deg * (Math.PI / 180); }

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat1)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** 타임머신(예측) API 호출 */
async function fetchPredictionRoute(
  apiKey: string,
  start: Location,
  end: Location,
  viaPoints: Location[],
  targetTime: Date,
  timeMode: 'departure' | 'arrival'
): Promise<{ data: RouteResponse, duration: number, distance: number, debug: DebugInfo }> {

  const cleanKey = apiKey.trim();
  const formattedTime = formatIsoStringKST(targetTime);

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
      wayPoints: viaPoints.length > 0 ? {
        wayPoint: viaPoints.map(p => ({
          lon: p.lng,
          lat: p.lat,
          poiId: p.id
        }))
      } : undefined
    },
    searchOption: "00",
    tollgateCarType: "CAR",
    trafficInfo: "Y",
    totalValue: 1
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
    const startPoint = data.features.find(f => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
    const props = (startPoint?.properties || data.features[0].properties);
    distance = Number(props.totalDistance || 0);
    duration = Number(props.totalTime || 0);
  }

  return {
    data,
    duration,
    distance,
    debug: {
      requestUrl: url,
      requestPayload: payload,
      timestamp: new Date().toISOString(),
      mode: `Prediction (${timeMode})`
    }
  };
}

/** 순서 최적화 API (옵션) */
async function fetchOptimization(
  apiKey: string,
  start: Location,
  end: Location,
  viaPoints: Location[],
  startTime: Date
): Promise<{ data: RouteResponse, debug: DebugInfo }> {

  const cleanKey = apiKey.trim();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formattedStartTime = `${startTime.getFullYear()}${pad(startTime.getMonth() + 1)}${pad(startTime.getDate())}${pad(startTime.getHours())}${pad(startTime.getMinutes())}`;

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
  return {
    data,
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
  } catch {
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
  } catch {
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

  const validViaPoints = viaPoints.filter(p => p.lat && p.lng && !isNaN(Number(p.lat)) && !isNaN(Number(p.lng)));

  let orderedViaPoints = [...validViaPoints];

  if (useOptimization && validViaPoints.length > 0) {
    try {
      const optResponse = await fetchOptimization(apiKey, start, end, validViaPoints, cleanTargetTime);
      const features = optResponse.data.features || [];

      const newOrder: Location[] = [];
      const visitedIds = new Set<string>();

      for (const f of features) {
        if (f.geometry?.type === 'Point' && f.properties?.viaPointId) {
          const pid = f.properties.viaPointId;
          if (!visitedIds.has(pid)) {
            const originalPoint = validViaPoints.find(vp => vp.id === pid);
            if (originalPoint) {
              newOrder.push(originalPoint);
              visitedIds.add(pid);
            }
          }
        }
      }

      if (newOrder.length > 0) {
        validViaPoints.forEach(vp => { if (!visitedIds.has(vp.id)) newOrder.push(vp); });
        orderedViaPoints = newOrder;
      }
    } catch (e) {
      console.warn("Optimization API failed, using original order.", e);
    }
  }

  const responseData = await fetchPredictionRoute(apiKey, start, end, orderedViaPoints, cleanTargetTime, timeMode);
  const { data, duration, distance, debug } = responseData;

  const baseStartTime = timeMode === 'departure' ? cleanTargetTime : cleanTargetTime;

  return processOptimizationResponse(
    data,
    start,
    end,
    orderedViaPoints,
    baseStartTime,
    duration,
    distance,
    debug,
    timeMode,
    cleanTargetTime
  );
};

// =========================================================
// [핵심 수정 완료] 무결성 보장 처리 로직
// =========================================================
const processOptimizationResponse = (
  data: RouteResponse,
  start: Location,
  end: Location,
  orderedViaPoints: Location[],
  calculatedStartTime: Date,
  apiDuration: number,
  apiDistance: number,
  debugInfo: DebugInfo,
  timeMode: 'departure' | 'arrival' = 'departure',
  targetTime: Date
): OptimizationResult => {

  const features = data.features || [];

  const startPoint = features.find(f => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
  const headProps = (startPoint?.properties || features[0]?.properties || {});
  const fareInfo = {
    toll: Number(headProps.totalFare || 0),
    taxi: Number(headProps.taxiFare || 0),
    fuel: Number(headProps.fuelPrice || 0)
  };

  const totalDistance = Number(apiDistance || headProps.totalDistance || 0);
  const totalTravelSeconds = Number(apiDuration || headProps.totalTime || 0);

  // --- (A) Feature 결정론적 정렬 (수정됨) ---
  const withOriginalIndex = features.map((f, i) => ({ f, __i: i }));

  const getIndex = (p: any) => {
    const v = p?.index;
    const n = (v === undefined || v === null) ? Number.MAX_SAFE_INTEGER : Number(v);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };

  const getLineIndex = (p: any) => {
    const v = p?.lineIndex;
    const n = (v === undefined || v === null) ? Number.MAX_SAFE_INTEGER : Number(v);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };

  // [수정] 무조건 Point가 LineString보다 먼저 와야 합니다.
  // 그래야 "도착 확인(Point)" -> "구간 리셋" -> "다음 구간 이동(LineString)" 순서가 보장됩니다.
  const typeOrder = (geomType: string) => {
    if (geomType === 'Point') return 0;      // 1순위: 도착/경유 지점
    if (geomType === 'LineString') return 1; // 2순위: 이동 경로
    return 2;
  };

  const sorted = withOriginalIndex
    .slice()
    .sort((a, b) => {
      const ap = a.f.properties;
      const bp = b.f.properties;

      // 1) index 오름차순 (경로 순서)
      const ia = getIndex(ap);
      const ib = getIndex(bp);
      if (ia !== ib) return ia - ib;

      // 2) 같은 index 내에서는 무조건 Point 먼저!
      const oa = typeOrder(a.f.geometry?.type || '');
      const ob = typeOrder(b.f.geometry?.type || '');
      if (oa !== ob) return oa - ob;

      // 3) LineString끼리는 lineIndex로 세부 정렬
      const la = getLineIndex(ap);
      const lb = getLineIndex(bp);
      if (la !== lb) return la - lb;

      // 4) 최후: 원본 순서
      return a.__i - b.__i;
    })
    .map(x => x.f);

  // --- (B) 세그먼트 누적 파싱 ---
  const stops: OptimizedStop[] = [];
  const fullPath: { lat: number; lng: number }[] = [];
  const segments: RouteSegment[] = [];

  let currentSegTime = 0;    
  let currentSegDist = 0;    

  // B1..Bn 매칭
  const viaByOrdinal = (ord: number) => orderedViaPoints[ord - 1];

  const matchViaFallback = (lat: number, lng: number, viaPointId?: string) => {
    if (viaPointId) {
      const found = orderedViaPoints.find(v => v.id === viaPointId);
      if (found) return found;
    }
    let best: { v: Location, d: number } | null = null;
    for (const v of orderedViaPoints) {
      const dKm = getDistanceFromLatLonInKm(lat, lng, Number(v.lat), Number(v.lng));
      if (!best || dKm < best.d) best = { v, d: dKm };
    }
    return (best && best.d < 0.05) ? best.v : null;
  };

  const pushStop = (stop: OptimizedStop) => {
    stops.push(stop);
    // [핵심] Stop 추가 직후 누적치 리셋 (다음 구간을 위해)
    currentSegTime = 0;
    currentSegDist = 0;
  };

  for (const feature of sorted) {
    const props: any = feature.properties || {};
    const g = feature.geometry;

    if (!g) continue;

    // (1) Point 처리 (도착 지점) -> 먼저 처리됨!
    if (g.type === 'Point') {
      const coords = g.coordinates as number[];
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      const pt = String(props.pointType || '');

      // 출발지
      if (pt === 'S') {
        pushStop({
          id: start.id,
          name: start.name,
          arrivalTime: "",
          rawArrivalTime: "",
          type: 'Start',
          sequence: 0,
          lat: lat.toString(),
          lng: lng.toString(),
          durationFromPrevious: 0,
          distanceFromPrevious: 0,
          stayTime: 0
        });
        continue;
      }

      // 도착지
      if (pt === 'E') {
        // 지금까지 누적된 LineString 값(currentSegTime)이 바로 "마지막 구간 소요시간"
        pushStop({
          id: end.id,
          name: end.name,
          arrivalTime: "",
          rawArrivalTime: "",
          type: 'End',
          sequence: 999,
          lat: lat.toString(),
          lng: lng.toString(),
          durationFromPrevious: currentSegTime,
          distanceFromPrevious: currentSegDist,
          stayTime: 0
        });
        continue;
      }

      // 경유지
      const m = /^B(\d+)$/.exec(pt);
      let via: Location | null = null;

      if (m) {
        const ord = Number(m[1]);
        via = viaByOrdinal(ord) || null;
      }
      if (!via) {
        via = matchViaFallback(lat, lng, props.viaPointId);
      }

      if (via) {
        const stayMin = via.stayTime || 0;
        // 지금까지 누적된 LineString 값이 "이 경유지까지 오는 데 걸린 시간"
        pushStop({
          id: via.id,
          name: via.name || props.name || "경유지",
          arrivalTime: "",
          departureTime: "",
          rawArrivalTime: "",
          type: 'Via',
          sequence: stops.length,
          lat: lat.toString(),
          lng: lng.toString(),
          durationFromPrevious: currentSegTime,
          distanceFromPrevious: currentSegDist,
          stayTime: stayMin,
          isFixed: via.isFixedFirst
        });
      }
      continue;
    }

    // (2) LineString 처리 (이동 경로) -> Point 처리 후 실행됨!
    if (g.type === 'LineString') {
      const t = Number(props.time || 0);
      const d = Number(props.distance || 0);

      const dt = Number.isFinite(t) ? Math.max(0, Math.round(t)) : 0;
      const dd = Number.isFinite(d) ? Math.max(0, Math.round(d)) : 0;

      // 다음 Point를 만날 때까지 계속 누적
      currentSegTime += dt;
      currentSegDist += dd;

      const coords = g.coordinates as number[][];
      const segmentPath = coords.map(c => ({ lat: c[1], lng: c[0] }));
      fullPath.push(...segmentPath);

      const congestionVal = Number(props.congestion);
      segments.push({
        path: segmentPath,
        congestion: isNaN(congestionVal) ? 0 : congestionVal,
        color: getCongestionColor(congestionVal)
      });
    }
  }

  // --- (C) 안전장치 (Start/End 누락 대비) ---
  if (!stops.some(s => s.type === 'Start')) {
    stops.unshift({
      id: start.id, name: start.name, arrivalTime: "", rawArrivalTime: "", type: 'Start', sequence: 0,
      lat: start.lat, lng: start.lng, durationFromPrevious: 0, distanceFromPrevious: 0, stayTime: 0
    });
  }
  if (!stops.some(s => s.type === 'End')) {
    stops.push({
      id: end.id, name: end.name, arrivalTime: "", rawArrivalTime: "", type: 'End', sequence: 999,
      lat: end.lat, lng: end.lng, durationFromPrevious: currentSegTime, distanceFromPrevious: currentSegDist, stayTime: 0
    });
  }

  // --- (D) 총 시간 오차 보정 ---
  const computedTravel = stops
    .filter(s => s.type !== 'Start')
    .reduce((sum, s) => sum + Math.round(s.durationFromPrevious || 0), 0);

  const diff = Math.round(totalTravelSeconds) - computedTravel;
  if (diff !== 0) {
    const endStop = stops.find(s => s.type === 'End');
    if (endStop) {
      endStop.durationFromPrevious = Math.max(0, Math.round(endStop.durationFromPrevious || 0) + diff);
    }
  }

  // --- (E) 최종 타임라인 계산 ---
  const finalStops = (() => {
    const out = stops.map(s => ({ ...s }));

    if (timeMode === 'departure') {
      let ts = calculatedStartTime.getTime();
      
      // Start
      out[0].rawArrivalTime = new Date(ts).toISOString();
      out[0].arrivalTime = formatTimeDisplay(new Date(ts));
      out[0].sequence = 0;

      for (let i = 1; i < out.length; i++) {
        const travelSec = Math.round(out[i].durationFromPrevious || 0);
        ts += travelSec * 1000;

        const arr = new Date(ts);
        out[i].rawArrivalTime = arr.toISOString();
        out[i].arrivalTime = formatTimeDisplay(arr);

        const stayMin = out[i].stayTime || 0;
        if (stayMin > 0) {
          ts += stayMin * 60 * 1000;
          out[i].departureTime = formatTimeDisplay(new Date(ts));
        }
        out[i].sequence = i;
      }
      return out;
    }

    // Arrival Mode
    let ts = targetTime.getTime();
    const endIdx = out.findIndex(s => s.type === 'End');
    if (endIdx >= 0) {
      out[endIdx].rawArrivalTime = new Date(ts).toISOString();
      out[endIdx].arrivalTime = formatTimeDisplay(new Date(ts));
    }

    for (let i = endIdx; i > 0; i--) {
      const stayMin = out[i - 1].stayTime || 0;
      const travelSec = Math.round(out[i].durationFromPrevious || 0);
      
      ts -= travelSec * 1000;
      const dep = new Date(ts);

      if (stayMin > 0) {
        out[i - 1].departureTime = formatTimeDisplay(dep);
        ts -= stayMin * 60 * 1000;
      }

      const arr = new Date(ts);
      out[i - 1].rawArrivalTime = arr.toISOString();
      out[i - 1].arrivalTime = formatTimeDisplay(arr);
    }
    out.forEach((s, idx) => s.sequence = idx);
    return out;
  })();

  const totalStaySec = finalStops.reduce((sum, s) => sum + ((s.stayTime || 0) * 60), 0);
  const totalDurationIncludingStay = Math.round(totalTravelSeconds + totalStaySec);

  return {
    stops: finalStops,
    summary: {
      totalDistance,
      totalDuration: totalDurationIncludingStay,
      fares: fareInfo
    },
    targetDateTime: `${formatDateDisplay(targetTime)} ${formatTimeDisplay(targetTime)}`,
    path: fullPath,
    segments,
    debug: { ...debugInfo, calculationLogs: [] }
  };
};