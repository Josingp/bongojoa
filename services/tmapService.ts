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

/** * [메인 래퍼 함수] 10개 이상의 다중 경유지를 처리하기 위한 구간 분할(Chunking) 호출 로직
 */
async function fetchPredictionRoute(
  start: Location,
  end: Location,
  viaPoints: Location[],
  targetTime: Date,
  timeMode: 'departure' | 'arrival'
): Promise<{ data: RouteResponse, duration: number, distance: number, debug: DebugInfo }> {

  // TMAP 타임머신 API는 경유지를 안전하게 최대 3개까지만 지원합니다.
  const MAX_VIAS_PER_CHUNK = 3;
  
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

  const allFeatures: any[] = [];
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
      allFeatures.push(...res.data.features);

      // 요금 데이터 누적 합산
      const sPoint = res.data.features.find(f => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
      if (sPoint && sPoint.properties) {
         totalToll += Number(sPoint.properties.totalFare || 0);
         totalTaxi += Number(sPoint.properties.taxiFare || 0);
         totalFuel += Number(sPoint.properties.fuelPrice || 0);
      }

      // 다음 구간 호출을 위해 도착 시간 및 체류 시간 가산
      if (j < chunks.length - 1) {
        currentTime = new Date(currentTime.getTime() + res.duration * 1000);
        const stayTime = chunkEnd.stayTime || 0;
        currentTime = new Date(currentTime.getTime() + stayTime * 60 * 1000);
      }
    }
  } else { // arrival 모드 (역순으로 계산)
    let currentTime = new Date(targetTime.getTime());
    for (let j = chunks.length - 1; j >= 0; j--) {
      const chunk = chunks[j];
      const chunkStart = chunk[0];
      const chunkEnd = chunk[chunk.length - 1];
      const chunkVias = chunk.slice(1, chunk.length - 1);

      const res = await _fetchPredictionRoute(chunkStart, chunkEnd, chunkVias, currentTime, 'arrival');

      totalDistance += res.distance;
      totalDuration += res.duration;
      allFeatures.unshift(...res.data.features); // 순서 유지를 위해 앞에 삽입

      const sPoint = res.data.features.find(f => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
      if (sPoint && sPoint.properties) {
         totalToll += Number(sPoint.properties.totalFare || 0);
         totalTaxi += Number(sPoint.properties.taxiFare || 0);
         totalFuel += Number(sPoint.properties.fuelPrice || 0);
      }

      if (j > 0) {
        currentTime = new Date(currentTime.getTime() - res.duration * 1000);
        const stayTime = chunkStart.stayTime || 0;
        currentTime = new Date(currentTime.getTime() - stayTime * 60 * 1000);
      }
    }
  }

  // 누적 합산된 최종 메타데이터를 첫 번째 포인트에 병합하여 후처리 함수가 인식하도록 함
  const firstPoint = allFeatures.find(f => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
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

export const getAddressFromCoords = async (lat: number, lng: number): Promise<string> => {
  const url = `${API_BASE}${REVERSE_GEO_ENDPOINT}?lat=${lat}&lon=${lng}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) return "선택된 위치";
    const data = await response.json();
    return data.addressInfo?.fullAddress || "알 수 없는 위치";
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
  targetTime: Date
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
    toll: Number(headProps.totalFare || 0),
    taxi: Number(headProps.taxiFare || 0),
    fuel: Number(headProps.fuelPrice || 0)
  };

  const totalTravelSeconds = Number(apiDuration || headProps.totalTime || 0);
  const totalTravelDistance = Number(apiDistance || headProps.totalDistance || 0);

  const pointFeatures = features.filter(f => f.geometry?.type === 'Point');
  const lineFeatures = features.filter(f => f.geometry?.type === 'LineString');
  
  type Coord = number[];
  const clusters: { id: number; center: Coord }[] = [];
  const getClusterId = (coord: Coord) => {
    for (const c of clusters) {
      if (isNearLocation(c.center, coord)) return c.id;
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

  interface Node {
    type: 'Start' | 'Via' | 'End';
    location: Location;
    coord: Coord;
    cid: number;
  }

  const nodes: Node[] = [];
  nodes.push({ type: 'Start', location: start, coord: apiStartCoord, cid: getClusterId(apiStartCoord) });

  for (const via of orderedViaPoints) {
    const c = getClosestPointFeatureCoord(via);
    nodes.push({ type: 'Via', location: via, coord: c, cid: getClusterId(c) });
  }

  nodes.push({ type: 'End', location: end, coord: apiEndCoord, cid: getClusterId(apiEndCoord) });

  interface Edge {
    id: number;
    a: number; b: number;
    time: number; dist: number;
    coords: Coord[];
    congestion: number;
  }

  const edges: Edge[] = lineFeatures.map((f, id) => {
    const coords = (f.geometry.coordinates as Coord[]) || [];
    const s = coords[0];
    const e = coords[coords.length - 1];
    const a = getClusterId(s);
    const b = getClusterId(e);
    const t = Number(f.properties?.time || 0);
    const d = Number(f.properties?.distance || 0);
    const props = f.properties as any;
    const congestionVal = Number(props.congestion ?? props.trafficIndex ?? 0);

    return {
      id, a, b,
      time: Number.isFinite(t) ? Math.max(0, Math.round(t)) : 0,
      dist: Number.isFinite(d) ? Math.max(0, Math.round(d)) : 0,
      coords,
      congestion: congestionVal,
    };
  });

  const adj = new Map<number, Edge[]>();
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push(e);
    adj.get(e.b)!.push(e);
  }
  const other = (e: Edge, cid: number) => (e.a === cid ? e.b : e.a);

  const dijkstraPath = (startCids: number[], targetCids: number[]) => {
    type State = { cid: number; dist: number; };
    const dist = new Map<number, number>();
    const prev = new Map<number, { from: number; edgeId: number }>();
    const pq: State[] = [];

    for (const s of startCids) {
      dist.set(s, 0);
      pq.push({ cid: s, dist: 0 });
    }

    const targetSet = new Set(targetCids);
    let finalEndCid = -1;

    const popMin = () => {
      let mi = 0;
      for (let i = 1; i < pq.length; i++) {
        if (pq[i].dist < pq[mi].dist) mi = i;
      }
      const v = pq[mi];
      pq.splice(mi, 1);
      return v;
    };

    while (pq.length) {
      const cur = popMin();
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
    id: start.id, name: start.name, type: 'Start', sequence: 0,
    arrivalTime: '', rawArrivalTime: '',
    lat: start.lat, lng: start.lng,
    durationFromPrevious: 0, distanceFromPrevious: 0, stayTime: 0
  });

  const findNearbyClusters = (coord: Coord, rangeKm: number) => {
    return clusters.filter(c => isNearLocation(c.center, coord, rangeKm)).map(c => c.id);
  };

  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    let edgeIds = dijkstraPath([from.cid], [to.cid]);

    if (!edgeIds || edgeIds.length === 0) {
        const starts = findNearbyClusters(from.coord, 0.1);
        const ends = findNearbyClusters(to.coord, 0.1);
        if(!starts.includes(from.cid)) starts.push(from.cid);
        if(!ends.includes(to.cid)) ends.push(to.cid);
        edgeIds = dijkstraPath(starts, ends);
    }

    let segTime = 0;
    let segDist = 0;

    if (edgeIds && edgeIds.length) {
      let curCoord = from.coord;
      for (const eid of edgeIds) {
        const e = edges[eid];
        const startC = e.coords[0];
        const forward = isNearLocation(startC, curCoord, 0.05);
        const pathCoords = forward ? e.coords : [...e.coords].reverse();
        segTime += e.time;
        segDist += e.dist;
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

    stops.push({
      id: to.location.id,
      name: to.location.name,
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

  const computedTravel = stops.reduce((sum, s) => sum + (s.durationFromPrevious || 0), 0);
  const diff = Math.round(totalTravelSeconds) - computedTravel;
  
  if (diff !== 0) {
    const endStop = stops.find(s => s.type === 'End');
    if (endStop) {
      const original = endStop.durationFromPrevious || 0;
      endStop.durationFromPrevious = Math.max(0, original + diff);
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
