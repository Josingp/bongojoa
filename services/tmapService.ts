import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT, ROUTE_ENDPOINT } from '../constants';
import { Location, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult, RouteSegment, DebugInfo } from '../types';

const REVERSE_GEO_ENDPOINT = "/geo/reversegeocoding?version=1&addressType=A10&coordType=WGS84GEO";
const PREDICTION_ENDPOINT = "/routes/prediction?version=1&format=json";

// [핵심 1] 타임존 왜곡 방지: 무조건 사용자가 입력한 시각에 +0900을 붙여서 보냄
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

const formatTmapDateTime = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}${MM}${dd}${hh}${mm}`;
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

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

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

/**
 * 타임머신(예측) API 호출
 */
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
    const props = data.features[0].properties;
    distance = Number(props.totalDistance || 0);
    duration = Number(props.totalTime || 0);
  }

  return {
    data, duration, distance,
    debug: {
      requestUrl: url,
      requestPayload: payload,
      timestamp: new Date().toISOString(),
      mode: `Prediction (${timeMode})`
    }
  };
}

// 순서 최적화 API
async function fetchOptimization(
  apiKey: string,
  start: Location,
  end: Location,
  viaPoints: Location[],
  startTime: Date
): Promise<{ data: RouteResponse, duration: number, distance: number, debug: DebugInfo }> {

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
    data, duration: 0, distance: 0,
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

  const validViaPoints = viaPoints.filter(p => p.lat && p.lng && !isNaN(Number(p.lat)) && !isNaN(Number(p.lng)));

  // 1) 최적화(순서 변경)
  let orderedViaPoints = [...validViaPoints];

  if (useOptimization && validViaPoints.length > 0) {
    try {
      const optResponse = await fetchOptimization(apiKey, start, end, validViaPoints, cleanTargetTime);
      const features = optResponse.data.features || [];

      const newOrder: Location[] = [];
      const visitedIds = new Set<string>();

      for (const f of features) {
        if (f.geometry.type === 'Point' && f.properties.viaPointId) {
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
        validViaPoints.forEach(vp => {
          if (!visitedIds.has(vp.id)) newOrder.push(vp);
        });
        orderedViaPoints = newOrder;
      }
    } catch (error) {
      console.warn("Optimization API failed, using original order.", error);
    }
  }

  // 2) 타임머신 예측 경로
  const responseData = await fetchPredictionRoute(apiKey, start, end, orderedViaPoints, cleanTargetTime, timeMode);
  const { data, duration, distance, debug } = responseData;

  // departure 모드: startTime은 사용자가 넣은 값 그대로
  // arrival 모드: 계산상 startTime을 뒤로 당겨야 하지만, 아래에서 “전체 시프트”로 더 안전하게 맞출 수 있음.
  let calculatedStartTime = cleanTargetTime;
  if (timeMode === 'arrival') {
    const totalStayMinutes = orderedViaPoints.reduce((sum, p) => sum + (p.stayTime || 0), 0);
    calculatedStartTime = new Date(cleanTargetTime.getTime() - (duration * 1000) - (totalStayMinutes * 60000));
    calculatedStartTime.setMilliseconds(0);
  }

  return processOptimizationResponse(
    data,
    start,
    end,
    orderedViaPoints,
    calculatedStartTime,
    duration,
    distance,
    debug,
    timeMode,
    cleanTargetTime
  );
};

// -------------------------
// 여기부터 핵심 수정 구간
// -------------------------

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

  // ---------- helpers ----------
  const pointTypeStr = (v: any) => (v === undefined || v === null) ? "" : String(v);

  const isStartPT = (pt: string) => pt === "S" || pt.startsWith("S");
  const isEndPT = (pt: string) => pt === "E" || pt.startsWith("E");
  const isViaPT = (pt: string) => {
    // Tmap에서 Via/경유류 pointType이 다양한 경우를 넓게 흡수
    // (P, PP, Via, B1~B5 등)
    if (!pt) return false;
    const upper = pt.toUpperCase();
    return (
      upper.startsWith("P") ||
      upper.startsWith("VIA") ||
      upper.startsWith("B1") || upper.startsWith("B2") || upper.startsWith("B3") || upper.startsWith("B4") || upper.startsWith("B5")
    );
  };

  const isSameLocation = (c1: number[], c2: number[]) => {
    if (!c1 || !c2) return false;
    // coordinates are [lng, lat]
    const distKm = getDistanceFromLatLonInKm(c1[1], c1[0], c2[1], c2[0]);
    return distKm < 0.05; // 50m (20m는 실전에서 종종 빗나감)
  };

  // ---------- fare ----------
  let fareInfo = { toll: 0, taxi: 0, fuel: 0 };
  if (data.features && data.features.length > 0) {
    const props = data.features[0].properties;
    fareInfo.toll = Number(props.totalFare || 0);
    fareInfo.taxi = Number(props.taxiFare || 0);
    fareInfo.fuel = Number(props.fuelPrice || 0);
  }

  const totalDistance = apiDistance;
  const features = data.features || [];

  // ---------- scaling ----------
  let segmentSum = 0;
  for (const f of features) {
    if (f.geometry.type === 'LineString') {
      segmentSum += Number(f.properties.time || 0);
    }
  }
  const scaleRatio = (segmentSum > 0 && apiDuration > 0) ? (apiDuration / segmentSum) : 1;

  const calculationLogs: string[] = [];
  calculationLogs.push(`=== Calculation Start ===`);
  calculationLogs.push(`Start Time: ${formatIsoStringKST(calculatedStartTime)}`);
  calculationLogs.push(`API Total Duration: ${apiDuration}s`);
  calculationLogs.push(`Sum of Segments: ${segmentSum}s`);
  calculationLogs.push(`Scale Ratio: ${scaleRatio.toFixed(6)}`);

  // ---------- Step 1: initial sort by index (but keep original order as fallback) ----------
  const indexedFeatures = features.map((f, i) => ({ ...f, _originalIndex: i }));

  const sortedFeatures = indexedFeatures.sort((a, b) => {
    const propsA = a.properties;
    const propsB = b.properties;

    const ptA = pointTypeStr(propsA.pointType);
    const ptB = pointTypeStr(propsB.pointType);

    if (isStartPT(ptA)) return -1;
    if (isStartPT(ptB)) return 1;
    if (isEndPT(ptA)) return 1;
    if (isEndPT(ptB)) return -1;

    const idxA = propsA.index;
    const idxB = propsB.index;

    const hasIdxA = idxA !== undefined && idxA !== null;
    const hasIdxB = idxB !== undefined && idxB !== null;

    if (hasIdxA && hasIdxB) {
      const numA = Number(idxA);
      const numB = Number(idxB);

      if (numA !== numB) return numA - numB;

      // 같은 index에서는 "Point 먼저, LineString 나중" (세그먼트 경계 안정화)
      const typeA = a.geometry.type;
      const typeB = b.geometry.type;
      if (typeA === 'Point' && typeB === 'LineString') return -1;
      if (typeA === 'LineString' && typeB === 'Point') return 1;
    }

    return a._originalIndex - b._originalIndex;
  });

  // ---------- Step 2: Geometric reordering (MULTI-PASS until stable) ----------
  const reorderedFeatures = [...sortedFeatures];
  const pointsToReorder = reorderedFeatures.filter(f => f.geometry.type === 'Point');

  // 한 번만 돌리면 “이동한 결과로 새로 고아(LineString)가 생기는” 케이스가 남습니다.
  // 그래서 pass를 반복해서 “더 이상 변화가 없을 때” 종료합니다.
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;

    for (const p of pointsToReorder) {
      const pCoords = p.geometry.coordinates as number[];
      let pIdx = reorderedFeatures.indexOf(p);
      if (pIdx < 0) continue;

      // (1) incoming lines: LineString의 마지막 좌표가 이 Point와 같으면 "Point 앞"이어야 함
      const incoming = reorderedFeatures.filter(f =>
        f.geometry.type === 'LineString' &&
        f.geometry.coordinates &&
        isSameLocation(f.geometry.coordinates[f.geometry.coordinates.length - 1] as number[], pCoords)
      );

      for (const line of incoming) {
        const li = reorderedFeatures.indexOf(line);
        pIdx = reorderedFeatures.indexOf(p);
        if (li > pIdx) {
          reorderedFeatures.splice(li, 1);
          const newPIdx = reorderedFeatures.indexOf(p);
          reorderedFeatures.splice(newPIdx, 0, line);
          changed = true;
        }
      }

      // (2) outgoing lines: LineString의 첫 좌표가 이 Point와 같으면 "Point 뒤"여야 함
      const outgoing = reorderedFeatures.filter(f =>
        f.geometry.type === 'LineString' &&
        f.geometry.coordinates &&
        isSameLocation(f.geometry.coordinates[0] as number[], pCoords)
      );

      for (const line of outgoing) {
        const li = reorderedFeatures.indexOf(line);
        const newPIdx = reorderedFeatures.indexOf(p);
        if (li < newPIdx) {
          reorderedFeatures.splice(li, 1);
          const updatedPIdx = reorderedFeatures.indexOf(p);
          reorderedFeatures.splice(updatedPIdx + 1, 0, line);
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  // ---------- Step 3: extract stops & segments ----------
  const stops: (OptimizedStop & { _order: number })[] = [];
  const fullPath: { lat: number; lng: number }[] = [];
  const segments: RouteSegment[] = [];

  let orderCounter = 0;

  // 세그먼트 누적(“이 Point 직전까지”를 그 Point의 durationFromPrevious로 기록)
  let currentSegmentDistance = 0;
  let currentSegmentTime = 0;

  // safety net용(“Via까지의 누적 travel time”)
  let assignedDurationSum = 0;
  let assignedDistanceSum = 0;

  const visitedViaIndices = new Set<number>();

  for (const feature of reorderedFeatures) {
    const props = feature.properties;

    if (feature.geometry.type === 'LineString') {
      const rawTime = Number(props.time || 0);
      const adjustedTime = rawTime * scaleRatio;

      currentSegmentDistance += Number(props.distance || 0);
      currentSegmentTime += adjustedTime;

      const coords = feature.geometry.coordinates as number[][];
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

    if (feature.geometry.type !== 'Point') continue;

    const coords = feature.geometry.coordinates as number[];
    const pt = pointTypeStr(props.pointType);
    const lat = Number(coords[1]);
    const lng = Number(coords[0]);

    // Start
    if (isStartPT(pt)) {
      stops.push({
        _order: orderCounter++,
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

      // reset
      currentSegmentDistance = 0;
      currentSegmentTime = 0;
      assignedDurationSum = 0;
      assignedDistanceSum = 0;
      continue;
    }

    // End
    if (isEndPT(pt)) {
      // 마지막 구간이 0으로 잡히는 케이스를 강제 보정
      let finalSegTime = currentSegmentTime;
      let finalSegDist = currentSegmentDistance;

      if (finalSegTime <= 1 && apiDuration > 0) {
        const remainingTime = Math.max(0, apiDuration - assignedDurationSum);
        const remainingDist = Math.max(0, totalDistance - assignedDistanceSum);

        // remainingTime이 의미있으면 그걸 마지막 구간으로 확정
        if (remainingTime > 0) {
          finalSegTime = remainingTime;
          finalSegDist = remainingDist;
        }
      }

      stops.push({
        _order: orderCounter++,
        id: end.id,
        name: end.name,
        arrivalTime: "",
        rawArrivalTime: "",
        type: 'End',
        sequence: 999,
        lat: lat.toString(),
        lng: lng.toString(),
        durationFromPrevious: finalSegTime,
        distanceFromPrevious: finalSegDist,
        stayTime: 0
      });

      // reset
      currentSegmentDistance = 0;
      currentSegmentTime = 0;
      continue;
    }

    // Via candidate
    if (!isViaPT(pt)) {
      // 경유지가 아닌 잡다한 Point는 무시(경계 reset하면 오히려 구간이 쪼개져서 망가짐)
      continue;
    }

    // Via matching
    let matchedIndex = -1;

    if (props.viaPointId) {
      matchedIndex = originalViaPoints.findIndex(vp => vp.id === props.viaPointId);
    }

    if (matchedIndex === -1) {
      matchedIndex = originalViaPoints.findIndex((vp, idx) => {
        if (visitedViaIndices.has(idx)) return false;
        const dist = getDistanceFromLatLonInKm(lat, lng, Number(vp.lat), Number(vp.lng));
        return dist < 0.08; // 80m (실전에서 50m도 종종 빗나감)
      });
    }

    if (matchedIndex === -1) {
      // 매칭 실패 시, 이 Point로 인해 세그먼트를 reset하지 않음(이게 0초 구간의 큰 원인)
      continue;
    }

    if (visitedViaIndices.has(matchedIndex)) {
      continue;
    }

    const original = originalViaPoints[matchedIndex];
    visitedViaIndices.add(matchedIndex);

    const currentStayTime = original.stayTime || 0;

    stops.push({
      _order: orderCounter++,
      id: original.id,
      name: original.name || props.name || "경유지",
      arrivalTime: "",
      departureTime: "",
      rawArrivalTime: "",
      type: 'Via',
      sequence: stops.length,
      lat: lat.toString(),
      lng: lng.toString(),
      durationFromPrevious: currentSegmentTime,
      distanceFromPrevious: currentSegmentDistance,
      stayTime: currentStayTime,
      isFixed: original.isFixedFirst
    });

    assignedDurationSum += currentSegmentTime;
    assignedDistanceSum += currentSegmentDistance;

    // reset for next leg
    currentSegmentDistance = 0;
    currentSegmentTime = 0;
  }

  // ---------- Step 4: sort stops by extraction order, but enforce Start first / End last ----------
  // "Via끼리 0 반환" 같은 불안정 정렬 제거: _order로 고정
  const startStops = stops.filter(s => s.type === 'Start').sort((a, b) => a._order - b._order);
  const endStops = stops.filter(s => s.type === 'End').sort((a, b) => a._order - b._order);
  const viaStops = stops.filter(s => s.type === 'Via').sort((a, b) => a._order - b._order);

  const sortedStops = [
    ...(startStops.length ? [startStops[0]] : []),
    ...viaStops,
    ...(endStops.length ? [endStops[endStops.length - 1]] : [])
  ];

  // ---------- Step 5: sequential time recalculation ----------
  let currentTimestamp = calculatedStartTime.getTime();

  const finalStops: OptimizedStop[] = sortedStops.map((stop, index) => {
    const travelTimeSec = Number(stop.durationFromPrevious || 0);
    currentTimestamp += travelTimeSec * 1000;

    const arrivalDate = new Date(currentTimestamp);
    stop.rawArrivalTime = arrivalDate.toISOString();
    stop.arrivalTime = formatTimeDisplay(arrivalDate);

    if (stop.stayTime && stop.stayTime > 0) {
      currentTimestamp += stop.stayTime * 60 * 1000;
      const departureDate = new Date(currentTimestamp);
      stop.departureTime = formatTimeDisplay(departureDate);
    }

    stop.sequence = index;

    // _order 제거 (UI/타입 오염 방지)
    const { _order, ...cleanStop } = stop as any;
    return cleanStop as OptimizedStop;
  });

  // arrival 모드면 “End 도착시간을 targetTime으로 강제 정렬(전체 시프트)”
  if (timeMode === 'arrival') {
    const endIndex = finalStops.findIndex(s => s.type === 'End');
    if (endIndex >= 0) {
      const endArr = new Date(finalStops[endIndex].rawArrivalTime).getTime();
      const delta = targetTime.getTime() - endArr;

      if (Math.abs(delta) > 500) {
        for (const s of finalStops) {
          const arr = new Date(s.rawArrivalTime).getTime() + delta;
          const arrDate = new Date(arr);
          s.rawArrivalTime = arrDate.toISOString();
          s.arrivalTime = formatTimeDisplay(arrDate);

          if (s.departureTime && s.stayTime && s.stayTime > 0) {
            // departureTime은 arrivalTime + stayTime이므로 재계산
            const dep = arr + s.stayTime * 60 * 1000;
            s.departureTime = formatTimeDisplay(new Date(dep));
          }
        }
      }
    }
  }

  const totalDurationIncludingStay = (new Date(finalStops[finalStops.length - 1].rawArrivalTime).getTime() - calculatedStartTime.getTime()) / 1000
    + (finalStops[finalStops.length - 1].stayTime ? finalStops[finalStops.length - 1].stayTime * 60 : 0);

  return {
    stops: finalStops,
    summary: {
      totalDistance: totalDistance,
      totalDuration: totalDurationIncludingStay,
      fares: fareInfo
    },
    targetDateTime: `${formatDateDisplay(targetTime)} ${formatTimeDisplay(targetTime)}`,
    path: fullPath,
    segments: segments,
    debug: {
      ...debugInfo,
      calculationLogs
    }
  };
};
