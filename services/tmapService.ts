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
  GeoJSONFeature
} from '../types';

/** "N/A"나 null 같은 비정상 값이 NaN으로 누적되는 걸 방지 */
const safeNum = (val: unknown): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};

/**
 * TMAP 타임머신 API가 한 번에 받는 경유지 최대 개수.
 * 실측(2026-10-27): 5개까지 정상 응답(B1~B5), 6개부터 400(code 1100) 반환.
 */
const MAX_VIAS_PER_CALL = 5;

/** 사용자 화면에서의 시간 기준 */
export type TimeMode = 'departure' | 'arrival';

/**
 * ⚠️ TMAP 타임머신 API의 predictionType은 "입력하는 시간"이 아니라 "예측해 달라는 시간"이다.
 *   - predictionType: "arrival"   → 출발 시간을 주고 도착 시간을 예측 (응답 departureTime == 입력값)
 *   - predictionType: "departure" → 도착 시간을 주고 출발 시간을 예측 (응답 arrivalTime  == 입력값)
 * 실제 응답으로 확인(2026-10-27). 화면의 '출발 시간 기준'은 API의 "arrival", '도착 희망 기준'은 "departure"로 보내야 한다.
 */
const toApiPredictionType = (mode: TimeMode): 'departure' | 'arrival' =>
  mode === 'departure' ? 'arrival' : 'departure';

// ───────────────────────── 시간 포맷 (항상 KST 기준) ─────────────────────────

interface KstParts { yyyy: string; MM: string; dd: string; hh: string; mm: string; ss: string; }

/** 브라우저 타임존과 무관하게 주어진 시각을 Asia/Seoul 벽시계 값으로 분해 */
const getKstParts = (date: Date): KstParts => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { yyyy: get('year'), MM: get('month'), dd: get('day'), hh: hour, mm: get('minute'), ss: get('second') };
};

/** 타임머신 API predictionTime 형식: YYYY-MM-DDTHH:mm:ss+0900 (콜론 없는 오프셋만 허용, 'Z'/'+09:00'은 400) */
const formatIsoStringKST = (date: Date): string => {
  const p = getKstParts(date);
  return `${p.yyyy}-${p.MM}-${p.dd}T${p.hh}:${p.mm}:${p.ss}+0900`;
};

/** 경유지 최적화 API startTime 형식: YYYYMMDDHHmm */
const formatCompactKST = (date: Date): string => {
  const p = getKstParts(date);
  return `${p.yyyy}${p.MM}${p.dd}${p.hh}${p.mm}`;
};

const formatTimeDisplay = (date: Date): string => {
  const p = getKstParts(date);
  let hour = Number(p.hh);
  const ampm = hour >= 12 ? '오후' : '오전';
  hour = hour % 12;
  hour = hour === 0 ? 12 : hour;
  return `${ampm} ${hour}:${p.mm}`;
};

const formatDateDisplay = (date: Date): string => {
  const p = getKstParts(date);
  return `${Number(p.MM)}월 ${Number(p.dd)}일`;
};

/** TMAP 응답의 "2026-10-28T08:30:00+0900" → Date (파싱 실패 시 null) */
const parseTmapTime = (val: unknown): Date | null => {
  if (typeof val !== 'string' || !val) return null;
  // JS Date는 "+0900" 형식을 엔진에 따라 거부하므로 "+09:00"으로 정규화
  const normalized = val.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ───────────────────────── 타임머신 API 호출 ─────────────────────────

interface ParsedLeg {
  time: number;                        // 초
  dist: number;                        // m
  path: { lat: number; lng: number }[];
}

interface PredictionCallResult {
  legs: ParsedLeg[];
  totalTime: number;
  totalDistance: number;
  departureTime: Date | null;          // API가 확정한 출발 시각
  arrivalTime: Date | null;            // API가 확정한 도착 시각
  fares: { toll: number; taxi: number; fuel: number };
  debug: DebugInfo;
}

const isBoundaryPointType = (pt: string) => pt === 'S' || pt === 'E' || /^[BP]\d+$/.test(pt);

/**
 * TMAP 응답 features는 [Point(S), LineString…, Point(B1), LineString…, …, Point(E), (가상 라인/요약 B 포인트)] 순서다.
 * 경계 Point(S, B1~Bn, E) 사이의 LineString time/distance를 합산하면 구간별 값이 정확히 나온다
 * (실측: 구간 합 == totalTime, == totalDistance). E 이후의 요약 포인트/가상 라인은 무시한다.
 */
const parseLegs = (features: GeoJSONFeature[]): ParsedLeg[] => {
  const legs: ParsedLeg[] = [];
  let started = false;
  let cur: ParsedLeg | null = null;

  for (const f of features) {
    if (f.geometry?.type === 'Point') {
      const pt = String(f.properties?.pointType ?? '');
      if (!isBoundaryPointType(pt)) continue;       // N(회전 안내 지점)은 구간 경계가 아님
      if (pt === 'S') {
        if (started) continue;
        started = true;
        cur = { time: 0, dist: 0, path: [] };
        continue;
      }
      if (!started || !cur) continue;
      legs.push(cur);
      if (pt === 'E') break;                         // 도착 이후(요약 B 포인트, 가상 라인)는 무시
      cur = { time: 0, dist: 0, path: [] };
    } else if (f.geometry?.type === 'LineString' && started && cur) {
      const props: any = f.properties || {};
      // "경유지와 연결된 가상의 라인"은 time/distance 자체가 없음 → 제외
      if (props.distance === undefined && props.time === undefined) continue;
      cur.time += safeNum(props.time);
      cur.dist += safeNum(props.distance);
      const coords = (f.geometry.coordinates as number[][]) || [];
      for (const c of coords) {
        if (Array.isArray(c) && c.length >= 2) cur.path.push({ lat: Number(c[1]), lng: Number(c[0]) });
      }
    }
  }
  return legs;
};

/** 단일 타임머신 API 호출 (경유지 ≤ MAX_VIAS_PER_CALL) */
async function callPrediction(
  start: Location,
  end: Location,
  viaPoints: Location[],
  targetTime: Date,
  mode: TimeMode
): Promise<PredictionCallResult> {
  if (viaPoints.length > MAX_VIAS_PER_CALL) {
    throw new Error(`타임머신 API 1회 호출 경유지 한도(${MAX_VIAS_PER_CALL}개) 초과`);
  }

  const payload = {
    routesInfo: {
      departure: { name: start.name || '출발지', lon: String(start.lng), lat: String(start.lat) },
      destination: { name: end.name || '도착지', lon: String(end.lng), lat: String(end.lat) },
      predictionType: toApiPredictionType(mode),
      predictionTime: formatIsoStringKST(targetTime),
      wayPoints: viaPoints.length > 0
        ? { wayPoint: viaPoints.map(p => ({ lon: String(p.lng), lat: String(p.lat) })) }
        : undefined,
      searchOption: '00',
      tollgateCarType: 'car',
      trafficInfo: 'Y'
    }
  };

  const url = `${API_BASE}${ROUTE_PREDICTION_ENDPOINT}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[bongojoa] TMAP prediction error body:', errorBody);
    throw new Error(`Prediction API Error (${response.status}): ${errorBody}`);
  }

  const data: RouteResponse = await response.json();
  const features = data.features || [];
  const sPoint = features.find(f => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
  const props: any = sPoint?.properties || features[0]?.properties || {};

  const legs = parseLegs(features);
  const expectedLegs = viaPoints.length + 1;
  const totalTime = safeNum(props.totalTime);
  const totalDistance = safeNum(props.totalDistance);

  if (legs.length !== expectedLegs) {
    // 경계 포인트가 기대와 다르면 구간 배분이 불가 → 총량을 직선거리 비례로 배분 (정상 응답에서는 발생하지 않음)
    console.warn(`[bongojoa] 구간 수 불일치: parsed=${legs.length} expected=${expectedLegs} → 직선거리 비례 배분`);
    const nodes = [start, ...viaPoints, end];
    const allPath = legs.flatMap(l => l.path);
    const sl = nodes.slice(1).map((n, i) =>
      haversineKm(Number(nodes[i].lat), Number(nodes[i].lng), Number(n.lat), Number(n.lng)));
    const slTotal = sl.reduce((a, b) => a + b, 0) || 1;
    legs.length = 0;
    nodes.slice(1).forEach((_, i) => legs.push({
      time: Math.round(totalTime * sl[i] / slTotal),
      dist: Math.round(totalDistance * sl[i] / slTotal),
      path: i === 0 ? allPath : []
    }));
  }

  // 구간 합이 API 총량과 어긋나면(반올림 등) 마지막 구간에서 보정 → 청크 도착 시각이 API arrivalTime과 정확히 일치
  const sumTime = legs.reduce((a, l) => a + l.time, 0);
  const sumDist = legs.reduce((a, l) => a + l.dist, 0);
  if (legs.length > 0) {
    if (totalTime > 0 && sumTime !== totalTime) legs[legs.length - 1].time = Math.max(0, legs[legs.length - 1].time + (totalTime - sumTime));
    if (totalDistance > 0 && sumDist !== totalDistance) legs[legs.length - 1].dist = Math.max(0, legs[legs.length - 1].dist + (totalDistance - sumDist));
  }

  console.log('[bongojoa] prediction', {
    mode, apiType: payload.routesInfo.predictionType, sent: payload.routesInfo.predictionTime,
    departureTime: props.departureTime, arrivalTime: props.arrivalTime,
    totalTime, totalDistance, legTimes: legs.map(l => l.time)
  });

  return {
    legs,
    totalTime,
    totalDistance,
    departureTime: parseTmapTime(props.departureTime),
    arrivalTime: parseTmapTime(props.arrivalTime),
    fares: { toll: safeNum(props.totalFare), taxi: safeNum(props.taxiFare), fuel: safeNum(props.fuelPrice) },
    debug: {
      requestUrl: url,
      requestPayload: payload,
      timestamp: new Date().toISOString(),
      mode: `Prediction (${mode} → api:${payload.routesInfo.predictionType})`
    }
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ───────────────────────── 청크 분할 ─────────────────────────

interface Chunk {
  from: Location;
  vias: Location[];
  to: Location;
  fromIndex: number;      // 전체 노드 배열([start, ...vias, end]) 기준 from 인덱스
}

/**
 * 호출 단위를 나눈다. 경계 조건:
 *  1) 한 호출 경유지 수가 MAX_VIAS_PER_CALL에 도달
 *  2) 체류 시간이 있는 경유지 — 체류 후 출발 시각이 달라지므로 다음 구간은 그 시각으로 다시 예측해야 정확함
 */
const planChunks = (start: Location, vias: Location[], end: Location): Chunk[] => {
  const nodes = [start, ...vias, end];
  const chunks: Chunk[] = [];
  let from = 0;
  let curVias: Location[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const isEnd = i === nodes.length - 1;
    if (isEnd) {
      chunks.push({ from: nodes[from], vias: curVias, to: node, fromIndex: from });
      break;
    }
    const stay = safeNum(node.stayTime);
    if (stay > 0 || curVias.length === MAX_VIAS_PER_CALL) {
      chunks.push({ from: nodes[from], vias: curVias, to: node, fromIndex: from });
      from = i;
      curVias = [];
    } else {
      curVias.push(node);
    }
  }
  return chunks;
};

// ───────────────────────── 경유지 순서 최적화 API ─────────────────────────

async function fetchOptimization(
  start: Location,
  end: Location,
  viaPoints: Location[],
  startTime: Date
): Promise<{ data: RouteResponse, debug: DebugInfo }> {
  const payload = {
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    startName: start.name || '출발',
    startX: start.lng,
    startY: start.lat,
    startTime: formatCompactKST(startTime),
    endName: end.name || '도착',
    endX: end.lng,
    endY: end.lat,
    searchOption: '0',
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
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Optimization API Error (${response.status}): ${errorBody}`);
  }

  const data: RouteResponse = await response.json();
  return {
    data,
    debug: { requestUrl: url, requestPayload: payload, timestamp: new Date().toISOString(), mode: 'Optimization (Reorder)' }
  };
}

// ───────────────────────── POI / 역지오코딩 ─────────────────────────

/** POI 검색 결과에서 전체 주소 문자열 생성 (도로명 우선, 없으면 지번) */
export const formatPoiFullAddress = (poi: PoiItem): string => {
  if (poi.roadName) {
    const buildingNo = poi.firstNo
      ? (poi.secondNo && poi.secondNo !== '0' ? `${poi.firstNo}-${poi.secondNo}` : poi.firstNo)
      : '';
    return [poi.upperAddrName, poi.middleAddrName, poi.roadName, buildingNo]
      .filter(Boolean).join(' ').trim();
  }
  return [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName, poi.detailAddrName]
    .filter(Boolean).join(' ').trim();
};

export const getAddressFromCoords = async (lat: number, lng: number): Promise<string> => {
  const url = `${API_BASE}${REVERSE_GEO_ENDPOINT}?lat=${lat}&lon=${lng}`;
  try {
    const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!response.ok) return '선택된 위치';
    const data = await response.json();
    const full: string = data.addressInfo?.fullAddress || '';
    if (full) {
      // TMAP은 "법정동주소,지번주소,도로명주소"를 쉼표로 이어서 반환 → 도로명(마지막) 우선 사용
      const parts = full.split(',').map((s: string) => s.trim()).filter(Boolean);
      return parts[parts.length - 1] || full;
    }
    return '알 수 없는 위치';
  } catch {
    return '위치 정보 불러오기 실패';
  }
};

export const searchPois = async (keyword: string): Promise<PoiItem[]> => {
  const url = `${API_BASE}${POI_SEARCH_ENDPOINT}?keyword=${encodeURIComponent(keyword)}`;
  try {
    const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!response.ok) return [];
    const data: PoiResponse = await response.json();
    return data.searchPoiInfo?.pois?.poi || [];
  } catch {
    return [];
  }
};

// ───────────────────────── 메인 ─────────────────────────

export const optimizeRoute = async (
  start: Location,
  end: Location,
  viaPoints: Location[],
  targetTime: Date,
  timeMode: TimeMode = 'departure',
  useOptimization: boolean = false
): Promise<OptimizationResult> => {

  const cleanTargetTime = new Date(targetTime);
  cleanTargetTime.setMilliseconds(0);

  const validViaPoints = viaPoints.filter(p => p.lat && p.lng && !isNaN(Number(p.lat)) && !isNaN(Number(p.lng)));

  // 1) 순서 최적화 (선택)
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
        // '우선 순위' 핀이 찍힌 경유지는 가장 먼저 방문 (입력 순서 유지)
        orderedViaPoints = [...newOrder.filter(v => v.isFixedFirst), ...newOrder.filter(v => !v.isFixedFirst)];
      }
    } catch (e) {
      console.warn('Optimization API failed, using original order.', e);
    }
  }

  // 2) 타임머신 예측 — 청크 단위로 호출하고, 시각은 API가 돌려준 departureTime/arrivalTime으로 앵커링
  const chunks = planChunks(start, orderedViaPoints, end);
  const results: PredictionCallResult[] = new Array(chunks.length);
  const logs: string[] = [];
  logs.push(`timeMode=${timeMode} (api predictionType=${toApiPredictionType(timeMode)}) target=${formatIsoStringKST(cleanTargetTime)} chunks=${chunks.length}`);

  if (timeMode === 'departure') {
    // 출발 시각 고정 → 앞에서부터: 다음 청크 출발 = 이전 청크 도착(API) + 경계 경유지 체류
    let depTime = cleanTargetTime;
    for (let c = 0; c < chunks.length; c++) {
      const ch = chunks[c];
      const res = await callPrediction(ch.from, ch.to, ch.vias, depTime, 'departure');
      results[c] = res;
      logs.push(`chunk[${c}] ${ch.from.name}→${ch.to.name} vias=${ch.vias.length} dep=${res.departureTime?.toISOString()} arr=${res.arrivalTime?.toISOString()} total=${res.totalTime}s`);
      const arr = res.arrivalTime ?? new Date(depTime.getTime() + res.totalTime * 1000);
      depTime = new Date(arr.getTime() + safeNum(ch.to.stayTime) * 60 * 1000);
    }
  } else {
    // 도착 시각 고정 → 뒤에서부터: 이전 청크 도착 = 이번 청크 출발(API) − 경계 경유지 체류
    let arrTime = cleanTargetTime;
    for (let c = chunks.length - 1; c >= 0; c--) {
      const ch = chunks[c];
      const res = await callPrediction(ch.from, ch.to, ch.vias, arrTime, 'arrival');
      results[c] = res;
      logs.push(`chunk[${c}] ${ch.from.name}→${ch.to.name} vias=${ch.vias.length} dep=${res.departureTime?.toISOString()} arr=${res.arrivalTime?.toISOString()} total=${res.totalTime}s`);
      const dep = res.departureTime ?? new Date(arrTime.getTime() - res.totalTime * 1000);
      arrTime = new Date(dep.getTime() - safeNum(ch.from.stayTime) * 60 * 1000);
    }
  }

  return buildResult(start, end, orderedViaPoints, chunks, results, cleanTargetTime, timeMode, logs);
};

// ───────────────────────── 결과 조립 ─────────────────────────

const buildResult = (
  start: Location,
  end: Location,
  orderedViaPoints: Location[],
  chunks: Chunk[],
  results: PredictionCallResult[],
  targetTime: Date,
  timeMode: TimeMode,
  logs: string[]
): OptimizationResult => {

  const nodes = [start, ...orderedViaPoints, end];

  // 구간(leg)을 노드 순서대로 평탄화: leg[i] = nodes[i] → nodes[i+1]
  const legs: ParsedLeg[] = [];
  const chunkStartLeg: number[] = [];
  chunks.forEach((_, c) => { chunkStartLeg.push(legs.length); legs.push(...results[c].legs); });

  const fares = results.reduce((acc, r) => ({
    toll: acc.toll + r.fares.toll, taxi: acc.taxi + r.fares.taxi, fuel: acc.fuel + r.fares.fuel
  }), { toll: 0, taxi: 0, fuel: 0 });

  const totalTravelSeconds = results.reduce((s, r) => s + r.totalTime, 0);
  const totalTravelDistance = results.reduce((s, r) => s + r.totalDistance, 0);

  // 시각 계산: 첫 청크의 API departureTime에서 출발해 구간 시간 + 체류 시간을 누적.
  // 청크 경계마다 API departureTime으로 다시 앵커링해 누적 오차를 없앤다.
  const firstDep = results[0]?.departureTime
    ?? (timeMode === 'departure' ? targetTime : new Date(targetTime.getTime() - totalTravelSeconds * 1000 - totalStayMs(orderedViaPoints)));

  const stops: OptimizedStop[] = [];
  let ts = firstDep.getTime();

  stops.push({
    id: start.id, name: start.name, address: start.address, type: 'Start', sequence: 0,
    arrivalTime: formatTimeDisplay(new Date(ts)), rawArrivalTime: new Date(ts).toISOString(),
    lat: start.lat, lng: start.lng,
    durationFromPrevious: 0, distanceFromPrevious: 0, stayTime: 0
  });

  const fullPath: { lat: number; lng: number }[] = [];
  const segments: RouteSegment[] = [];

  for (let i = 0; i < legs.length; i++) {
    // 청크 시작 구간이면 API 출발 시각으로 앵커링
    const c = chunkStartLeg.indexOf(i);
    if (c >= 0 && results[c].departureTime) ts = results[c].departureTime!.getTime();

    const leg = legs[i];
    const node = nodes[i + 1];
    const isEnd = i === legs.length - 1;
    ts += leg.time * 1000;
    const arr = new Date(ts);
    const stayMin = isEnd ? 0 : safeNum(node.stayTime);

    const stop: OptimizedStop = {
      id: node.id, name: node.name, address: node.address,
      type: isEnd ? 'End' : 'Via', sequence: i + 1,
      arrivalTime: formatTimeDisplay(arr), rawArrivalTime: arr.toISOString(),
      lat: node.lat, lng: node.lng,
      durationFromPrevious: leg.time, distanceFromPrevious: leg.dist,
      stayTime: stayMin, isFixed: node.isFixedFirst
    };
    if (stayMin > 0) {
      ts += stayMin * 60 * 1000;
      stop.departureTime = formatTimeDisplay(new Date(ts));
    }
    stops.push(stop);

    fullPath.push(...leg.path);
    if (leg.path.length > 0) segments.push({ path: leg.path, congestion: 0, color: '#3b82f6' });

    logs.push(`leg[${i}] ${nodes[i].name}→${node.name} time=${leg.time}s dist=${leg.dist}m arrive=${arr.toISOString()}`);
  }

  const totalStaySec = stops.reduce((sum, s) => sum + safeNum(s.stayTime) * 60, 0);

  return {
    stops,
    summary: {
      totalDistance: totalTravelDistance,
      totalDuration: Math.round(totalTravelSeconds + totalStaySec),
      fares
    },
    targetDateTime: `${formatDateDisplay(targetTime)} ${formatTimeDisplay(targetTime)}`,
    path: fullPath,
    segments,
    debug: {
      requestUrl: chunks.length === 1 ? results[0].debug.requestUrl : 'Chunked API Calls',
      requestPayload: chunks.length === 1 ? results[0].debug.requestPayload : { totalChunks: chunks.length, viaCount: orderedViaPoints.length },
      timestamp: new Date().toISOString(),
      mode: `Prediction (${timeMode} → api:${toApiPredictionType(timeMode)})${chunks.length > 1 ? ' chunked' : ''}`,
      calculationLogs: logs
    }
  };
};

const totalStayMs = (vias: Location[]) => vias.reduce((s, v) => s + safeNum(v.stayTime) * 60 * 1000, 0);
