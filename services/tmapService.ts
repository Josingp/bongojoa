import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT } from '../constants';
import {
  Location,
  RouteResponse,
  OptimizedStop,
  PoiItem,
  PoiResponse,
  OptimizationResult,
  RouteSegment,
  DebugInfo
} from '../types';

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

  // 요약(totalTime/totalDistance)는 pointType=S(출발지) properties에 존재하는 것이 정석입니다. :contentReference[oaicite:0]{index=0}
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

  // 1) (옵션) 순서 최적화
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

  // 2) 타임머신 길안내 호출
  const responseData = await fetchPredictionRoute(apiKey, start, end, orderedViaPoints, cleanTargetTime, timeMode);
  const { data, duration, distance, debug } = responseData;

  // departure: 기준 시각은 targetTime 그대로
  // arrival: “역산”을 위해 End를 targetTime으로 고정하고 거꾸로 계산
  const baseStartTime =
    timeMode === 'departure'
      ? cleanTargetTime
      : cleanTargetTime; // (실제 계산은 process에서 backward로 처리)

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
 * ✅ 무결성 핵심:
 * - 좌표 기반 재배열(Geometric Reorder) 금지
 * - index/lineIndex/pointType 기반 “결정론적” 파싱
 * - B1..Bn은 “요청에 넣은 wayPoint 순서”로 1차 매칭
 * - travel sum과 apiDuration 불일치 시 “마지막 구간에 잔여 보정(정수초)”로 합을 맞춤
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

  const features = data.features || [];

  // 요금/총합은 출발지 pointType=S properties가 정석 :contentReference[oaicite:1]{index=1}
  const startPoint = features.find(f => f.geometry?.type === 'Point' && f.properties?.pointType === 'S');
  const headProps = (startPoint?.properties || features[0]?.properties || {});
  const fareInfo = {
    toll: Number(headProps.totalFare || 0),
    taxi: Number(headProps.taxiFare || 0),
    fuel: Number(headProps.fuelPrice || 0)
  };

  const totalDistance = Number(apiDistance || headProps.totalDistance || 0);
  const totalTravelSeconds = Number(apiDuration || headProps.totalTime || 0);

  // --- (A) Feature 결정론적 정렬 ---
  // pointType=S/E/B1..는 “Point”에만 의미가 있고,
  // index는 “경로 순번”으로 모든 feature에 들어올 수 있습니다. :contentReference[oaicite:2]{index=2}
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

  const typeOrder = (geomType: string, pointType?: string) => {
    // 같은 index 내에서 “마지막 구간 누락” 방지의 핵심:
    // - Start(S): Point 먼저(출발) → 그 다음 LineString
    // - 그 외: LineString 먼저(이동) → Point(도착/경유) 나중
    if (pointType === 'S') return geomType === 'Point' ? 0 : 1;
    return geomType === 'LineString' ? 0 : 1;
  };

  const sorted = withOriginalIndex
    .slice()
    .sort((a, b) => {
      const ap = a.f.properties;
      const bp = b.f.properties;

      // 1) index 오름차순
      const ia = getIndex(ap);
      const ib = getIndex(bp);
      if (ia !== ib) return ia - ib;

      // 2) 같은 index 내 타입 우선순위
      const oa = typeOrder(a.f.geometry?.type, ap?.pointType);
      const ob = typeOrder(b.f.geometry?.type, bp?.pointType);
      if (oa !== ob) return oa - ob;

      // 3) LineString이면 lineIndex로 세부 정렬
      const la = getLineIndex(ap);
      const lb = getLineIndex(bp);
      if (la !== lb) return la - lb;

      // 4) 최후: 원본 순서(결정론 유지)
      return a.__i - b.__i;
    })
    .map(x => x.f);

  // --- (B) 세그먼트 누적 파싱 ---
  const stops: OptimizedStop[] = [];
  const fullPath: { lat: number; lng: number }[] = [];
  const segments: RouteSegment[] = [];

  let currentSegTime = 0;    // seconds (정수로 유지)
  let currentSegDist = 0;    // meters

  // 여행시간 합(경유지별)
  let travelSumAssigned = 0;

  // B1..Bn 매칭 (요청에 넣은 순서대로)
  const viaByOrdinal = (ord: number) => orderedViaPoints[ord - 1];

  // 보조 매칭(정말 예외일 때만)
  const matchViaFallback = (lat: number, lng: number, viaPointId?: string) => {
    if (viaPointId) {
      const found = orderedViaPoints.find(v => v.id === viaPointId);
      if (found) return found;
    }
    // 50m 이내 최근접
    let best: { v: Location, d: number } | null = null;
    for (const v of orderedViaPoints) {
      const dKm = getDistanceFromLatLonInKm(lat, lng, Number(v.lat), Number(v.lng));
      if (!best || dKm < best.d) best = { v, d: dKm };
    }
    return (best && best.d < 0.05) ? best.v : null;
  };

  const pushStop = (stop: OptimizedStop) => {
    stops.push(stop);
    // stop 추가 직후 세그먼트 누적치는 다음 구간을 위해 리셋
    currentSegTime = 0;
    currentSegDist = 0;
  };

  for (const feature of sorted) {
    const props: any = feature.properties || {};
    const g = feature.geometry;

    if (!g) continue;

    if (g.type === 'LineString') {
      const t = Number(props.time || 0);
      const d = Number(props.distance || 0);

      // 정수초 유지(소수점 스케일링 금지)
      const dt = Number.isFinite(t) ? Math.max(0, Math.round(t)) : 0;
      const dd = Number.isFinite(d) ? Math.max(0, Math.round(d)) : 0;

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

      continue;
    }

    if (g.type === 'Point') {
      const coords = g.coordinates as number[];
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      const pt = String(props.pointType || '');

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

      if (pt === 'E') {
        // 일단 현재 누적치를 End에 부여
        let endLegTime = currentSegTime;
        let endLegDist = currentSegDist;

        travelSumAssigned += endLegTime;

        pushStop({
          id: end.id,
          name: end.name,
          arrivalTime: "",
          rawArrivalTime: "",
          type: 'End',
          sequence: 999,
          lat: lat.toString(),
          lng: lng.toString(),
          durationFromPrevious: endLegTime,
          distanceFromPrevious: endLegDist,
          stayTime: 0
        });

        continue;
      }

      // 경유지: pointType이 B1/B2/... 형태가 정식 :contentReference[oaicite:3]{index=3}
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

        travelSumAssigned += currentSegTime;

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

      // N(일반 안내점) 등은 stop으로 쓰지 않음
      continue;
    }
  }

  // --- (C) stop 최소 무결성 보정 ---
  // Start/End가 없으면 강제로 생성(이상 응답 대비)
  if (!stops.some(s => s.type === 'Start')) {
    stops.unshift({
      id: start.id,
      name: start.name,
      arrivalTime: "",
      rawArrivalTime: "",
      type: 'Start',
      sequence: 0,
      lat: start.lat,
      lng: start.lng,
      durationFromPrevious: 0,
      distanceFromPrevious: 0,
      stayTime: 0
    });
  }
  if (!stops.some(s => s.type === 'End')) {
    // 남은 누적치가 있다면 End에 부여, 없다면 0
    stops.push({
      id: end.id,
      name: end.name,
      arrivalTime: "",
      rawArrivalTime: "",
      type: 'End',
      sequence: 999,
      lat: end.lat,
      lng: end.lng,
      durationFromPrevious: currentSegTime,
      distanceFromPrevious: currentSegDist,
      stayTime: 0
    });
    travelSumAssigned += currentSegTime;
  }

  // Start는 항상 0 구간
  stops[0].durationFromPrevious = 0;
  stops[0].distanceFromPrevious = 0;

  // --- (D) “여행시간 합 = API totalTime” 무결성 보정 (정수초) ---
  // (경유지 체류시간은 totalTime에 포함되지 않는 개념이 일반적이므로 travel만 맞춥니다.)
  // API 스펙상 totalTime은 경로 총 소요시간(초) :contentReference[oaicite:4]{index=4}
  const computedTravel = stops
    .filter(s => s.type !== 'Start')
    .reduce((sum, s) => sum + Math.round(s.durationFromPrevious || 0), 0);

  const diff = Math.round(totalTravelSeconds) - computedTravel;
  if (diff !== 0) {
    // 잔여는 “마지막 구간(End의 durationFromPrevious)”에만 합산
    // → 모든 중간 구간을 흔들지 않고도 합을 정확히 일치
    const endStop = stops.find(s => s.type === 'End');
    if (endStop) {
      endStop.durationFromPrevious = Math.max(0, Math.round(endStop.durationFromPrevious || 0) + diff);
    }
  }

  // --- (E) 타임라인 재계산 ---
  // departure: 앞으로 누적
  // arrival: End 도착을 targetTime으로 고정하고 거꾸로 누적
  const finalStops = (() => {
    const out = stops.map(s => ({ ...s })); // 불변성

    if (timeMode === 'departure') {
      let ts = calculatedStartTime.getTime();

      // Start 도착 = 시작시각
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

    // arrival mode: End를 targetTime으로 고정
    let ts = targetTime.getTime();

    // End arrival = targetTime
    const endIdx = out.findIndex(s => s.type === 'End');
    if (endIdx >= 0) {
      out[endIdx].rawArrivalTime = new Date(ts).toISOString();
      out[endIdx].arrivalTime = formatTimeDisplay(new Date(ts));
    }

    // 뒤에서 앞으로 역산
    for (let i = endIdx; i > 0; i--) {
      const stayMin = out[i - 1].stayTime || 0;

      // (i-1)에서 체류가 있었다면:
      // (i-1) departure = (i) 도착 - travel(i)
      // (i-1) arrival   = departure - stay
      const travelSec = Math.round(out[i].durationFromPrevious || 0);
      ts -= travelSec * 1000;
      const dep = new Date(ts);

      // i-1의 departure는 “i-1 stop을 떠나는 시각”
      if (stayMin > 0) {
        // departure 시각은 dep
        out[i - 1].departureTime = formatTimeDisplay(dep);
        ts -= stayMin * 60 * 1000;
      }

      const arr = new Date(ts);
      out[i - 1].rawArrivalTime = arr.toISOString();
      out[i - 1].arrivalTime = formatTimeDisplay(arr);
    }

    // Start sequence 정리
    out.forEach((s, idx) => s.sequence = idx);
    return out;
  })();

  // 총 소요(체류 포함)
  const totalStaySec = finalStops.reduce((sum, s) => sum + ((s.stayTime || 0) * 60), 0);
  const totalDurationIncludingStay = Math.round(totalTravelSeconds + totalStaySec);

  const calculationLogs: string[] = [];
  calculationLogs.push(`=== Integrity Calculation ===`);
  calculationLogs.push(`Mode: ${timeMode}`);
  calculationLogs.push(`API totalTravelSeconds: ${Math.round(totalTravelSeconds)}s`);
  calculationLogs.push(`Computed travel (after fix): ${
    finalStops.filter(s => s.type !== 'Start').reduce((sum, s) => sum + Math.round(s.durationFromPrevious || 0), 0)
  }s`);
  calculationLogs.push(`Total stay seconds: ${totalStaySec}s`);
  calculationLogs.push(`Total duration (travel+stay): ${totalDurationIncludingStay}s`);
  calculationLogs.push(`TargetTime: ${formatIsoStringKST(targetTime)}`);

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
    debug: {
      ...debugInfo,
      calculationLogs
    }
  };
};
