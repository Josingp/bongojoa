import { 
  API_BASE, 
  OPTIMIZATION_ENDPOINT, 
  POI_SEARCH_ENDPOINT, 
  REVERSE_GEO_ENDPOINT,
  ROUTE_PREDICTION_ENDPOINT 
} from '../constants';
import {
  Location,
  RouteResponse,
  OptimizedStop,
  PoiItem,
  PoiResponse,
  OptimizationResult,
  RouteSegment,
  DebugInfo,
  RouteResponseProperties
} from '../types';

/** "N/A"나 null 같은 비정상 값이 NaN으로 누적되는 걸 방지 */
const safeNum = (val: unknown): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};

/** TMAP API 경유지 청크 크기 상수 (타임머신 API 안정 지원 한계) */
const MAX_VIAS_PER_CHUNK = 3;

/** O(log n) 최소 힙 — Dijkstra 성능 최적화 */
class MinHeap<T> {
  private h: T[] = [];
  constructor(private cmp: (a: T, b: T) => number) {}
  push(v: T) {
    this.h.push(v);
    let i = this.h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(this.h[i], this.h[p]) < 0) {
        [this.h[i], this.h[p]] = [this.h[p], this.h[i]];
        i = p;
      } else break;
    }
  }
  pop(): T | undefined {
    if (!this.h.length) return undefined;
    const top = this.h[0];
    const last = this.h.pop()!;
    if (this.h.length) {
      this.h[0] = last;
      let i = 0;
      for (;;) {
        let s = i;
        const l = 2 * i + 1, r = 2 * i + 2;
        if (l < this.h.length && this.cmp(this.h[l], this.h[s]) < 0) s = l;
        if (r < this.h.length && this.cmp(this.h[r], this.h[s]) < 0) s = r;
        if (s === i) break;
        [this.h[i], this.h[s]] = [this.h[s], this.h[i]];
        i = s;
      }
    }
    return top;
  }
  get size() { return this.h.length; }
}

/** 타임존 왜곡 방지: KST 강제 변환 */
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
  // TMAP: 0=정보없음, 1=원활, 2=서행, 3=지체, 4=정체
  switch (c) {
    case 1: return "#10b981"; // Green (원활)
    case 2: return "#f59e0b"; // Orange (서행)
    case 3: return "#ef4444"; // Red (지체)
    case 4: return "#b91c1c"; // Dark Red (정체)
    default: return "#3b82f6"; // Blue (정보없음/기본)
  }
};

function deg2rad(deg: number) { return deg * (Math.PI / 180); }

/** 좌표 간 거리 계산 (km) */
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

/** 좌표 일치 여부 확인 */
const isNearLocation = (coords1: number[], coords2: number[], toleranceKm = 0.03) => {
    if (!coords1 || !coords2) return false;
    const dist = getDistanceFromLatLonInKm(coords1[1], coords1[0], coords2[1], coords2[0]);
    return dist < toleranceKm; 
};

/** * [내부 함수] 실제 단일 TMAP 타임머신 API 호출 로직 
 * (파라미터 제한을 우회하기 위해 래퍼 함수에서 호출됩니다)
 */
async function _fetchPredictionRoute(
  start: Location,
  end: Location,
  viaPoints: Location[],
  targetTime: Date,
  timeMode: 'departure' | 'arrival'
): Promise<{ data: RouteResponse, duration: number, distance: number, debug: DebugInfo }> {

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
          lat: p.lat
        }))
      } : undefined,
      searchOption: "00",
      tollgateCarType: "car",
      trafficInfo: "Y"
    }
  };

  const url = `${API_BASE}${ROUTE_PREDICTION_ENDPOINT}`;
  console.log('[bongojoa] prediction payload:', JSON.stringify(payload, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[bongojoa] TMAP 400 error body:', errorBody);
    throw new Error(`Prediction API Error (${response.status}): ${errorBody}`);
  }

  const data: RouteResponse = await response.json();

  let distance = 0;
  let duration = 0;

  if (data.features && data.features.length > 0) {
    const startPoint = data.features.find(f => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
    const props = (startPoint?.properties || data.features[0].properties);
    distance = safeNum(props.totalDistance);
    duration = safeNum(props.totalTime);
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

/** * [메인 래퍼 함수] 10개 이상의 다중 경유지를 처리하기 위한 구간 분할(Chunking) 호출 로직
 */
async function fetchPredictionRoute(
  start: Location,
  end: Location,
  viaPoints: Location[],
  targetTime: Date,
  timeMode: 'departure' | 'arrival'
): Promise<{ data: RouteResponse, duration: number, distance: number, debug: DebugInfo }> {

  if (viaPoints.length <= MAX_VIAS_PER_CHUNK) {
    return await _fetchPredictionRoute(start, end, viaPoints, targetTime, timeMode);
  }

  // 경유지가 많을 경우 구간(Chunk)으로 쪼갭니다.
  const points = [start, ...viaPoints, end];
  const chunks: Location[][] = [];
  let i = 0;
  
  while (i < points.length - 1) {
    // [시작점 + 경유지(최대3) + 도착점] = 한 구간당 최대 5개의 포인트 묶음
    const chunk = points.slice(i, i + MAX_VIAS_PER_CHUNK + 2);
    chunks.push(chunk);
    i += chunk.length - 1; // 다음 구간의 시작점은 현재 구간의 도착점과 겹치도록 설정
  }

  // 청크별 feature 수를 추적해 나중에 junction 좌표 정규화에 사용
  const chunkFeatures: any[][] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  let totalToll = 0;
  let totalTaxi = 0;
  let totalFuel = 0;

  if (timeMode === 'departure') {
    let currentTime = new Date(targetTime.getTime());
    for (let j = 0; j < chunks.length; j++) {
      const chunk = chunks[j];
      const chunkStart = chunk[0];
      const chunkEnd = chunk[chunk.length - 1];
      const chunkVias = chunk.slice(1, chunk.length - 1);

      const res = await _fetchPredictionRoute(chunkStart, chunkEnd, chunkVias, currentTime, 'departure');

      totalDistance += res.distance;
      totalDuration += res.duration;
      chunkFeatures.push(res.data.features);

      const sPoint = res.data.features.find((f: any) => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
      if (sPoint && sPoint.properties) {
         totalToll += safeNum(sPoint.properties.totalFare);
         totalTaxi += safeNum(sPoint.properties.taxiFare);
         totalFuel += safeNum(sPoint.properties.fuelPrice);
      }

      if (j < chunks.length - 1) {
        currentTime = new Date(currentTime.getTime() + res.duration * 1000);
        const stayTime = chunkEnd.stayTime || 0;
        currentTime = new Date(currentTime.getTime() + stayTime * 60 * 1000);
      }
    }
  } else {
    let currentTime = new Date(targetTime.getTime());
    for (let j = chunks.length - 1; j >= 0; j--) {
      const chunk = chunks[j];
      const chunkStart = chunk[0];
      const chunkEnd = chunk[chunk.length - 1];
      const chunkVias = chunk.slice(1, chunk.length - 1);

      const res = await _fetchPredictionRoute(chunkStart, chunkEnd, chunkVias, currentTime, 'arrival');

      totalDistance += res.distance;
      totalDuration += res.duration;
      chunkFeatures.unshift(res.data.features);

      const sPoint = res.data.features.find((f: any) => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
      if (sPoint && sPoint.properties) {
         totalToll += safeNum(sPoint.properties.totalFare);
         totalTaxi += safeNum(sPoint.properties.taxiFare);
         totalFuel += safeNum(sPoint.properties.fuelPrice);
      }

      if (j > 0) {
        currentTime = new Date(currentTime.getTime() - res.duration * 1000);
        const stayTime = chunkStart.stayTime || 0;
        currentTime = new Date(currentTime.getTime() - stayTime * 60 * 1000);
      }
    }
  }

  // ── Junction 좌표 정규화 ──────────────────────────────────────────────────
  // 청크 경계 노드(junction)는 앞 청크에서 'E', 뒤 청크에서 'S'로 도로 스냅된다.
  // 두 스냅 좌표가 30m 이상 다르면 Dijkstra 그래프가 단절되므로,
  // 뒤 청크의 S점과 첫 번째 LineString 시작점을 앞 청크 E점 좌표로 통일한다.
  for (let j = 0; j < chunkFeatures.length - 1; j++) {
    const prevFeats = chunkFeatures[j];
    const nextFeats = chunkFeatures[j + 1];

    // 앞 청크의 마지막 E 포인트 좌표
    let eCoord: number[] | null = null;
    for (let k = prevFeats.length - 1; k >= 0; k--) {
      const f = prevFeats[k];
      if (f.geometry?.type === 'Point' && f.properties?.pointType === 'E') {
        eCoord = f.geometry.coordinates as number[];
        break;
      }
    }
    if (!eCoord) continue;

    // 뒤 청크의 S 포인트를 앞 청크 E 좌표로 덮어쓰기
    for (const f of nextFeats) {
      if (f.geometry?.type === 'Point' && f.properties?.pointType === 'S') {
        f.geometry.coordinates = eCoord;
        break;
      }
    }
    // 뒤 청크 첫 번째 LineString의 첫 좌표도 통일
    for (const f of nextFeats) {
      if (f.geometry?.type === 'LineString') {
        const coords = f.geometry.coordinates as number[][];
        if (coords.length > 0) coords[0] = eCoord;
        break;
      }
    }
    // 앞 청크 마지막 LineString의 마지막 좌표도 통일
    for (let k = prevFeats.length - 1; k >= 0; k--) {
      if (prevFeats[k].geometry?.type === 'LineString') {
        const coords = prevFeats[k].geometry.coordinates as number[][];
        if (coords.length > 0) coords[coords.length - 1] = eCoord;
        break;
      }
    }
  }

  const allFeatures = chunkFeatures.flat();

  // 누적 합산된 최종 메타데이터를 첫 번째 포인트에 병합
  const firstPoint = allFeatures.find((f: any) => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
  if (firstPoint && firstPoint.properties) {
    firstPoint.properties.totalFare = totalToll;
    firstPoint.properties.taxiFare = totalTaxi;
    firstPoint.properties.fuelPrice = totalFuel;
    firstPoint.properties.totalDistance = totalDistance;
    firstPoint.properties.totalTime = totalDuration;
  }

  const combinedData: RouteResponse = {
    type: "FeatureCollection",
    features: allFeatures,
  };

  return {
    data: combinedData,
    duration: totalDuration,
    distance: totalDistance,
    debug: {
      requestUrl: 'Chunked API Calls',
      requestPayload: { totalChunks: chunks.length, viaCount: viaPoints.length },
      timestamp: new Date().toISOString(),
      mode: `Chunked Prediction (${timeMode})`
    }
  };
}

/** 순서 최적화 API */
async function fetchOptimization(
  start: Location,
  end: Location,
  viaPoints: Location[],
  startTime: Date
): Promise<{ data: RouteResponse, debug: DebugInfo }> {

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

  const url = `${API_BASE}${OPTIMIZATION_ENDPOINT}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
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

/** POI 검색 결과에서 전체 주소 문자열 생성 (도로명 우선, 없으면 지번) */
export const formatPoiFullAddress = (poi: PoiItem): string => {
  // 도로명 주소
  if (poi.roadName) {
    const buildingNo = poi.firstNo
      ? (poi.secondNo && poi.secondNo !== '0' ? `${poi.firstNo}-${poi.secondNo}` : poi.firstNo)
      : '';
    return [poi.upperAddrName, poi.middleAddrName, poi.roadName, buildingNo]
      .filter(Boolean).join(' ').trim();
  }
  // 지번 주소
  return [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName, poi.detailAddrName]
    .filter(Boolean).join(' ').trim();
};

export const getAddressFromCoords = async (lat: number, lng: number): Promise<string> => {
  const url = `${API_BASE}${REVERSE_GEO_ENDPOINT}?lat=${lat}&lon=${lng}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) return "선택된 위치";
    const data = await response.json();
    const full: string = data.addressInfo?.fullAddress || "";
    if (full) {
      // TMAP은 "법정동주소,지번주소,도로명주소"를 쉼표로 이어서 반환 → 도로명(마지막) 우선 사용
      const parts = full.split(',').map((s: string) => s.trim()).filter(Boolean);
      return parts[parts.length - 1] || full;
    }
    return "알 수 없는 위치";
  } catch {
    return "위치 정보 불러오기 실패";
  }
};

export const searchPois = async (keyword: string): Promise<PoiItem[]> => {
  const url = `${API_BASE}${POI_SEARCH_ENDPOINT}?keyword=${encodeURIComponent(keyword)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) return [];
    const data: PoiResponse = await response.json();
    return data.searchPoiInfo?.pois?.poi || [];
  } catch {
    return [];
  }
};

export const optimizeRoute = async (
  start: Location,
  end: Location,
  viaPoints: Location[],
  targetTime: Date,
  timeMode: 'departure' | 'arrival' = 'departure',
  useOptimization: boolean = false
): Promise<OptimizationResult> => {

  const cleanTargetTime = new Date(targetTime);
  cleanTargetTime.setMilliseconds(0);

  const validViaPoints = viaPoints.filter(p => p.lat && p.lng && !isNaN(Number(p.lat)) && !isNaN(Number(p.lng)));

  // 1) 순서 최적화
  let orderedViaPoints = [...validViaPoints];

  if (useOptimization && validViaPoints.length > 0) {
    try {
      const optResponse = await fetchOptimization(start, end, validViaPoints, cleanTargetTime);
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

  // 2) 타임머신 길안내
  const responseData = await fetchPredictionRoute(start, end, orderedViaPoints, cleanTargetTime, timeMode);
  const { data, duration, distance, debug } = responseData;

  // 청크 분할된 경우 junction 좌표 오차가 크므로 클러스터 허용 반경을 넓게 설정
  const isChunked = orderedViaPoints.length > MAX_VIAS_PER_CHUNK;

  return processOptimizationResponse(
    data,
    start,
    end,
    orderedViaPoints,
    cleanTargetTime,
    duration,
    distance,
    debug,
    timeMode,
    cleanTargetTime,
    isChunked ? 0.08 : 0.03
  );
};

/**
 * ✅ [Multi-Source Dijkstra Topology Walker with Congestion]
 */
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
  targetTime: Date,
  clusterToleranceKm = 0.03
): OptimizationResult => {

  const logs: string[] = [];
  logs.push(`=== START: Route Processing Log ===`);
  logs.push(`Time Mode: ${timeMode}`);
  logs.push(`API Total Duration: ${apiDuration}s`);
  logs.push(`API Total Distance: ${apiDistance}m`);

  const features = data.features || [];

  // 0) 메타데이터
  const startFeature = features.find(f => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
  const headProps = (startFeature?.properties || features[0]?.properties || {}) as RouteResponseProperties;
  const fareInfo = {
    toll: safeNum(headProps.totalFare),
    taxi: safeNum(headProps.taxiFare),
    fuel: safeNum(headProps.fuelPrice)
  };

  const totalTravelSeconds = Number(apiDuration || headProps.totalTime || 0);
  const totalTravelDistance = Number(apiDistance || headProps.totalDistance || 0);

  // ── 직접 파싱: features 순서에서 구간 time/distance 추출 (Dijkstra 불필요) ──
  // TMAP API는 [Point(S), LineStrings…, Point(B01), LineStrings…, …, Point(E)] 순으로 반환.
  // 청크 병합 시 E→S 경계 쌍은 사이에 LineString이 없으므로 junction으로 감지·건너뜀.
  const directSegTimes: number[] = [];
  const directSegDists: number[] = [];
  {
    // 경계 Point만 수집: S(출발), E(도착), B01/B02…(route API 경유지), P01/P02…(prediction API 경유지)
    // PP(회전 안내)는 /^[BP]\d+$/에 매칭 안 되므로 자동 제외.
    const isBoundaryPt = (pt: string) => pt === 'S' || pt === 'E' || /^[BP]\d+$/.test(pt);
    const allPtTypes: string[] = [];
    const ptIdxs: number[] = [];
    for (let fi = 0; fi < features.length; fi++) {
      if (features[fi].geometry?.type === 'Point') {
        const pt = String(features[fi].properties?.pointType ?? '');
        allPtTypes.push(pt);
        if (isBoundaryPt(pt)) ptIdxs.push(fi);
      }
    }
    console.log('[bongojoa] all Point types:', allPtTypes, '→ boundary ptIdxs:', ptIdxs.length);

    // junction/trailing 제거 (상태머신):
    // TMAP은 E 뒤에 trailing B1/B2/B3 요약 포인트를 추가로 반환하고,
    // 다음 청크는 S로 시작한다. 이 E→trailing B*→S 패턴을 건너뛰어야 구간 수가 맞는다.
    // - E를 만나면 afterChunkEnd = true
    // - afterChunkEnd 상태에서 B* → trailing 요약, 건너뜀
    // - afterChunkEnd 상태에서 S → junction S, 건너뛰고 상태 리셋
    const validPtIdxs: number[] = [];
    let afterChunkEnd = false;
    for (let p = 0; p < ptIdxs.length; p++) {
      const pt = String(features[ptIdxs[p]]?.properties?.pointType ?? '');
      if (pt === 'S') {
        if (p === 0) { validPtIdxs.push(ptIdxs[p]); afterChunkEnd = false; }
        else if (afterChunkEnd) { afterChunkEnd = false; } // junction S → skip
        else { validPtIdxs.push(ptIdxs[p]); }
      } else if (pt === 'E') {
        validPtIdxs.push(ptIdxs[p]); afterChunkEnd = true;
      } else {
        // B* or P* waypoint
        if (!afterChunkEnd) validPtIdxs.push(ptIdxs[p]); // trailing B → skip
      }
    }
    console.log('[bongojoa] validPtIdxs types:', validPtIdxs.map(i => features[i]?.properties?.pointType));

    // 인접 Point 쌍 사이 LineString 합산 → 구간별 time/dist
    for (let p = 0; p < validPtIdxs.length - 1; p++) {
      let t = 0, d = 0;
      for (let fi = validPtIdxs[p] + 1; fi < validPtIdxs[p + 1]; fi++) {
        if (features[fi].geometry?.type === 'LineString') {
          t += safeNum(features[fi].properties?.time);
          d += safeNum(features[fi].properties?.distance);
        }
      }
      directSegTimes.push(t);
      directSegDists.push(d);
    }

    const directTotal = directSegTimes.reduce((s, v) => s + v, 0);
    logs.push(`directParsing: ${directSegTimes.length} segs, sumTime=${directTotal}s (API=${totalTravelSeconds}s)`);
    console.log('[bongojoa] directParsing:', directSegTimes.length, 'segs, times:', directSegTimes, 'dists:', directSegDists, 'sumTime:', directTotal, 'API:', totalTravelSeconds);
  }

  const pointFeatures = features.filter(f => f.geometry?.type === 'Point');
  const lineFeatures = features.filter(f => f.geometry?.type === 'LineString');
  
  type Coord = number[];
  const clusters: { id: number; center: Coord }[] = [];
  const getClusterId = (coord: Coord) => {
    for (const c of clusters) {
      if (isNearLocation(c.center, coord, clusterToleranceKm)) return c.id;
    }
    const id = clusters.length;
    clusters.push({ id, center: coord });
    return id;
  };

  const getClosestPointFeatureCoord = (loc: Location): Coord => {
    const locCoord: Coord = [Number(loc.lng), Number(loc.lat)];
    let best: { c: Coord; d: number } | null = null;

    for (const p of pointFeatures) {
      const pt = String(p.properties?.pointType || '');
      if (!(pt.startsWith('B') || pt.startsWith('P') || pt === 'Via' || pt === 'PP')) continue;

      const pc = p.geometry.coordinates as Coord;
      const d = getDistanceFromLatLonInKm(locCoord[1], locCoord[0], pc[1], pc[0]);
      if (!best || d < best.d) best = { c: pc, d };
    }
    if (best && best.d < 0.05) return best.c;
    return locCoord;
  };

  const apiStartCoord = (startFeature?.geometry?.coordinates as Coord) || [Number(start.lng), Number(start.lat)];
  const endFeature = pointFeatures.find(p => p.properties?.pointType === 'E');
  const apiEndCoord = (endFeature?.geometry?.coordinates as Coord) || [Number(end.lng), Number(end.lat)];

  interface Edge {
    id: number;
    a: number; b: number;
    time: number; dist: number;
    coords: Coord[];
    congestion: number;
  }

  // ── 엣지를 노드보다 먼저 빌드 ────────────────────────────────────────────
  // 이 순서가 핵심: lineFeatures의 도로 스냅 좌표로 clusters를 먼저 채워야
  // 경유지 노드를 올바른 클러스터에 배정할 수 있다.
  // 노드를 먼저 빌드하면 POI 좌표(건물 중심)가 고립 클러스터로 등록되어
  // Dijkstra가 엣지를 찾지 못하고 0분 0km를 반환하는 버그가 발생한다.
  const edges: Edge[] = lineFeatures.map((f, id) => {
    const coords = (f.geometry.coordinates as Coord[]) || [];
    const s = coords[0];
    const e = coords[coords.length - 1];
    const a = getClusterId(s);
    const b = getClusterId(e);
    const props = f.properties as any;
    const congestionVal = Number(props.congestion ?? props.trafficIndex ?? 0);

    return {
      id, a, b,
      time: Math.max(0, Math.round(safeNum(f.properties?.time))),
      dist: Math.max(0, Math.round(safeNum(f.properties?.distance))),
      coords,
      congestion: isNaN(congestionVal) ? 0 : congestionVal,
    };
  });

  // TMAP Prediction API는 구간별 time/distance를 0으로 반환하는 경우가 있다.
  // 이 경우 좌표 기반 지리 거리로 apiDuration/apiDistance를 비례 배분한다.
  const totalEdgeTime = edges.reduce((sum, e) => sum + e.time, 0);
  const totalEdgeDist = edges.reduce((sum, e) => sum + e.dist, 0);
  if ((totalEdgeTime === 0 && apiDuration > 0) || (totalEdgeDist === 0 && apiDistance > 0)) {
    const geoLengthsM = edges.map(e => {
      let len = 0;
      for (let i = 1; i < e.coords.length; i++) {
        len += getDistanceFromLatLonInKm(
          e.coords[i-1][1], e.coords[i-1][0],
          e.coords[i][1], e.coords[i][0]
        ) * 1000;
      }
      return len;
    });
    const totalGeoM = geoLengthsM.reduce((s, l) => s + l, 0);
    if (totalGeoM > 0) {
      for (let i = 0; i < edges.length; i++) {
        if (totalEdgeTime === 0 && apiDuration > 0) {
          edges[i].time = Math.round(apiDuration * (geoLengthsM[i] / totalGeoM));
        }
        if (totalEdgeDist === 0 && apiDistance > 0) {
          edges[i].dist = Math.round(apiDistance * (geoLengthsM[i] / totalGeoM));
        }
      }
    }
  }

  const adj = new Map<number, Edge[]>();
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push(e);
    adj.get(e.b)!.push(e);
  }
  const other = (e: Edge, cid: number) => (e.a === cid ? e.b : e.a);

  // clusters가 도로 스냅 좌표로 채워진 후, 가장 가까운 연결된 클러스터를 반환
  // POI 좌표(건물 중심)는 실제 도로와 50~200m 차이날 수 있으므로 최근접 보정 필수
  const findConnectedCluster = (coord: Coord): number => {
    // 1단계: 허용 반경 내 연결된 클러스터
    for (const c of clusters) {
      if (adj.has(c.id) && isNearLocation(c.center, coord, clusterToleranceKm)) return c.id;
    }
    // 2단계: 반경 무관 최근접 연결 클러스터 (항상 성공)
    let best: { id: number; d: number } | null = null;
    for (const c of clusters) {
      if (!adj.has(c.id)) continue;
      const d = getDistanceFromLatLonInKm(coord[1], coord[0], c.center[1], c.center[0]);
      if (!best || d < best.d) best = { id: c.id, d };
    }
    return best ? best.id : getClusterId(coord);
  };

  interface Node {
    type: 'Start' | 'Via' | 'End';
    location: Location;
    coord: Coord;
    cid: number;
  }

  const nodes: Node[] = [];
  nodes.push({ type: 'Start', location: start, coord: apiStartCoord, cid: findConnectedCluster(apiStartCoord) });

  for (const via of orderedViaPoints) {
    const snapCoord = getClosestPointFeatureCoord(via);
    nodes.push({ type: 'Via', location: via, coord: snapCoord, cid: findConnectedCluster(snapCoord) });
  }

  nodes.push({ type: 'End', location: end, coord: apiEndCoord, cid: findConnectedCluster(apiEndCoord) });

  const dijkstraPath = (startCids: number[], targetCids: number[]) => {
    type State = { cid: number; dist: number; };
    const dist = new Map<number, number>();
    const prev = new Map<number, { from: number; edgeId: number }>();
    const pq = new MinHeap<State>((a, b) => a.dist - b.dist);

    for (const s of startCids) {
      dist.set(s, 0);
      pq.push({ cid: s, dist: 0 });
    }

    const targetSet = new Set(targetCids);
    let finalEndCid = -1;

    while (pq.size) {
      const cur = pq.pop()!;
      if (targetSet.has(cur.cid)) {
        finalEndCid = cur.cid;
        break;
      }
      const curBest = dist.get(cur.cid) ?? Number.POSITIVE_INFINITY;
      if (cur.dist !== curBest) continue;

      const candidates = (adj.get(cur.cid) || []).slice().sort((x, y) => x.id - y.id);
      for (const e of candidates) {
        const nxt = other(e, cur.cid);
        const nd = cur.dist + e.time;
        const old = dist.get(nxt);
        if (old === undefined || nd < old) {
          dist.set(nxt, nd);
          prev.set(nxt, { from: cur.cid, edgeId: e.id });
          pq.push({ cid: nxt, dist: nd });
        }
      }
    }

    if (finalEndCid === -1) return null;
    const edgeIds: number[] = [];
    let cur = finalEndCid;
    while (true) {
      const p = prev.get(cur);
      if (!p) break;
      edgeIds.push(p.edgeId);
      cur = p.from;
    }
    edgeIds.reverse();
    return edgeIds;
  };

  const stops: OptimizedStop[] = [];
  const fullPath: { lat: number; lng: number }[] = [];
  const segments: RouteSegment[] = [];

  stops.push({
    id: start.id, name: start.name, address: start.address, type: 'Start', sequence: 0,
    arrivalTime: '', rawArrivalTime: '',
    lat: start.lat, lng: start.lng,
    durationFromPrevious: 0, distanceFromPrevious: 0, stayTime: 0
  });

  const findNearbyClusters = (coord: Coord, rangeKm: number) => {
    return clusters.filter(c => isNearLocation(c.center, coord, rangeKm)).map(c => c.id);
  };

  const dbgEdgeTime = edges.reduce((s, e) => s + e.time, 0);
  const dbgEdgeDist = edges.reduce((s, e) => s + e.dist, 0);
  logs.push(`edges=${edges.length} totalEdgeTime=${dbgEdgeTime}s totalEdgeDist=${dbgEdgeDist}m clusters=${clusters.length} adjNodes=${adj.size}`);
  console.log('[bongojoa]', { edges: edges.length, totalEdgeTime: dbgEdgeTime, totalEdgeDist: dbgEdgeDist, clusters: clusters.length, nodes: nodes.length });

  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    let edgeIds = dijkstraPath([from.cid], [to.cid]);

    if (!edgeIds || edgeIds.length === 0) {
        const fallbackKm = Math.max(0.2, clusterToleranceKm * 3);
        const starts = findNearbyClusters(from.coord, fallbackKm);
        const ends = findNearbyClusters(to.coord, fallbackKm);
        if (!starts.includes(from.cid)) starts.push(from.cid);
        if (!ends.includes(to.cid)) ends.push(to.cid);
        edgeIds = dijkstraPath(starts, ends);
    }

    let segTimeDijkstra = 0;
    let segDistDijkstra = 0;

    if (edgeIds && edgeIds.length) {
      let curCoord = from.coord;
      for (const eid of edgeIds) {
        const e = edges[eid];
        const startC = e.coords[0];
        const forward = isNearLocation(startC, curCoord, 0.05);
        const pathCoords = forward ? e.coords : [...e.coords].reverse();
        segTimeDijkstra += e.time;
        segDistDijkstra += e.dist;
        const segmentPath = pathCoords.map(c => ({ lat: c[1], lng: c[0] }));
        fullPath.push(...segmentPath);
        const congestionVal = Number(e.congestion);
        segments.push({
          path: segmentPath,
          congestion: isNaN(congestionVal) ? 0 : congestionVal,
          color: getCongestionColor(congestionVal)
        });
        curCoord = pathCoords[pathCoords.length - 1];
      }
    }

    // 직접 파싱 우선 사용 (구간 수가 일치할 때); 아니면 Dijkstra 값
    const useDirectForSeg = directSegTimes.length === nodes.length - 1;
    const segTime = useDirectForSeg ? directSegTimes[i] : segTimeDijkstra;
    const segDist = useDirectForSeg ? directSegDists[i] : segDistDijkstra;

    logs.push(`seg[${i}] ${from.location.name}→${to.location.name} direct=${useDirectForSeg} time=${segTime}s dist=${segDist}m`);
    console.log(`[bongojoa] seg[${i}]`, from.location.name, '→', to.location.name, `direct=${useDirectForSeg}`, `time=${segTime}s`, `dist=${segDist}m`);

    stops.push({
      id: to.location.id,
      name: to.location.name,
      address: to.location.address,
      type: to.type as any,
      sequence: i + 1,
      arrivalTime: '',
      rawArrivalTime: '',
      lat: to.location.lat,
      lng: to.location.lng,
      durationFromPrevious: segTime,
      distanceFromPrevious: segDist,
      stayTime: to.type === 'Via' ? (to.location.stayTime || 0) : 0,
      isFixed: to.location.isFixedFirst
    });
  }

  // ── 구간 폴백 보정 ──────────────────────────────────────────────────────
  // Dijkstra가 실패한 구간(time=0 또는 dist=0)에 대해 API 총량을 직선거리 비례 배분.
  // 기존 코드는 End 정류장에만, 시간만 보정했지만 이제 모든 실패 구간 + 거리도 보정.
  const computedTravel = stops.reduce((sum, s) => sum + (s.durationFromPrevious || 0), 0);
  const computedDist   = stops.reduce((sum, s) => sum + (s.distanceFromPrevious  || 0), 0);
  const timeDiff = Math.round(totalTravelSeconds)  - computedTravel;
  const distDiff = Math.round(totalTravelDistance) - computedDist;

  logs.push(`post-loop: computedTravel=${computedTravel}s timeDiff=${timeDiff}s computedDist=${computedDist}m distDiff=${distDiff}m`);
  console.log('[bongojoa] post-loop', { computedTravel, timeDiff, computedDist, distDiff });

  // time=0인 구간 식별 (Start 제외)
  const zeroIdx: number[]  = [];
  const slDists: number[]  = [];   // 직선거리(m)

  for (let si = 1; si < stops.length; si++) {
    if ((stops[si].durationFromPrevious || 0) === 0) {
      zeroIdx.push(si);
      const p = stops[si - 1];
      const c = stops[si];
      slDists.push(
        getDistanceFromLatLonInKm(Number(p.lat), Number(p.lng), Number(c.lat), Number(c.lng)) * 1000
      );
    }
  }

  logs.push(`zeroTimeSegs=${zeroIdx.length} timeDiff=${timeDiff}s distDiff=${distDiff}m`);
  console.log('[bongojoa] zeroTimeSegs:', zeroIdx, 'slDists:', slDists, 'timeDiff:', timeDiff, 'distDiff:', distDiff);

  if (zeroIdx.length > 0) {
    const totalSl = slDists.reduce((s, d) => s + d, 0) || 1;

    if (timeDiff > 0) {
      // 정상: 남은 시간/거리를 직선거리 비례로 분배
      for (let zi = 0; zi < zeroIdx.length; zi++) {
        const idx = zeroIdx[zi];
        const frac = slDists[zi] / totalSl;
        stops[idx].durationFromPrevious = Math.max(1, Math.round(timeDiff * frac));
        if (distDiff > 0)
          stops[idx].distanceFromPrevious = Math.max(1, Math.round(distDiff * frac));
      }
    } else {
      // timeDiff <= 0: 다른 구간이 시간을 과점유 → 0 구간 추정치 확보 후 나머지 비례 축소
      const avgSpeedKmh = (totalTravelDistance > 0 && totalTravelSeconds > 0)
        ? (totalTravelDistance / 1000) / (totalTravelSeconds / 3600) : 50;
      const ests = slDists.map(sl =>
        Math.max(120, Math.round(sl * 1.4 / 1000 / avgSpeedKmh * 3600))
      );
      const estTotal = ests.reduce((s, v) => s + v, 0);
      const targetNonZero = Math.max(0, totalTravelSeconds - estTotal);

      if (computedTravel > 0 && targetNonZero > 0) {
        const scale = targetNonZero / computedTravel;
        for (let si = 1; si < stops.length; si++) {
          if ((stops[si].durationFromPrevious || 0) > 0)
            stops[si].durationFromPrevious = Math.max(1, Math.round((stops[si].durationFromPrevious || 0) * scale));
        }
      }
      for (let zi = 0; zi < zeroIdx.length; zi++) {
        const idx = zeroIdx[zi];
        stops[idx].durationFromPrevious = ests[zi];
        if (distDiff > 0)
          stops[idx].distanceFromPrevious = Math.max(1, Math.round(slDists[zi] * 1.4));
      }
      console.log('[bongojoa] steal-mode: ests', ests, 'scale', targetNonZero, '/', computedTravel);
    }
  } else if (timeDiff !== 0) {
    // 모든 구간 정상 — 잔차는 End 정류장 보정
    const endStop = stops.find(s => s.type === 'End');
    if (endStop) {
      endStop.durationFromPrevious = Math.max(0, (endStop.durationFromPrevious || 0) + timeDiff);
    }
  }

  const finalStops = stops.map(s => ({ ...s }));

  if (timeMode === 'departure') {
    let ts = calculatedStartTime.getTime();
    finalStops[0].rawArrivalTime = new Date(ts).toISOString();
    finalStops[0].arrivalTime = formatTimeDisplay(new Date(ts));
    for (let i = 1; i < finalStops.length; i++) {
      const dur = (finalStops[i].durationFromPrevious || 0);
      ts += dur * 1000;
      const arr = new Date(ts);
      finalStops[i].rawArrivalTime = arr.toISOString();
      finalStops[i].arrivalTime = formatTimeDisplay(arr);
      const stayMin = finalStops[i].stayTime || 0;
      if (stayMin > 0) {
        ts += stayMin * 60 * 1000;
        finalStops[i].departureTime = formatTimeDisplay(new Date(ts));
      }
    }
  } else {
    let ts = targetTime.getTime();
    const endIdx = finalStops.length - 1;
    finalStops[endIdx].rawArrivalTime = new Date(ts).toISOString();
    finalStops[endIdx].arrivalTime = formatTimeDisplay(new Date(ts));
    for (let i = endIdx; i > 0; i--) {
      const dur = (finalStops[i].durationFromPrevious || 0);
      ts -= dur * 1000;
      const dep = new Date(ts);
      const stayMin = finalStops[i - 1].stayTime || 0;
      if (stayMin > 0) {
        finalStops[i - 1].departureTime = formatTimeDisplay(dep);
        ts -= stayMin * 60 * 1000;
      }
      const arr = new Date(ts);
      finalStops[i - 1].rawArrivalTime = arr.toISOString();
      finalStops[i - 1].arrivalTime = formatTimeDisplay(arr);
    }
  }

  const totalStaySec = finalStops.reduce((sum, s) => sum + ((s.stayTime || 0) * 60), 0);
  const totalDurationIncludingStay = Math.round(totalTravelSeconds + totalStaySec);

  return {
    stops: finalStops,
    summary: {
      totalDistance: totalTravelDistance,
      totalDuration: totalDurationIncludingStay,
      fares: fareInfo
    },
    targetDateTime: `${formatDateDisplay(targetTime)} ${formatTimeDisplay(targetTime)}`,
    path: fullPath,
    segments,
    debug: { ...debugInfo, calculationLogs: logs }
  };
};
