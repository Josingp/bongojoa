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
    case 1: return "#10b981"; // 원활
    case 2: return "#f59e0b"; // 서행
    case 3: return "#ef4444"; // 정체
    case 4: return "#b91c1c"; // 심한 정체
    default: return "#3b82f6"; // 정보 없음
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

  const payload: any = {
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

  const payload: any = {
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

  // 1. 최적화 (순서 변경)
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

  // 2. 최종 경로 요청 (타임머신)
  const responseData = await fetchPredictionRoute(apiKey, start, end, orderedViaPoints, cleanTargetTime, timeMode);

  const { data, duration, distance, debug } = responseData;

  let actualStartTime = cleanTargetTime;
  if (timeMode === 'arrival') {
    const totalStayMinutes = orderedViaPoints.reduce((sum, p) => sum + (p.stayTime || 0), 0);
    actualStartTime = new Date(cleanTargetTime.getTime() - (duration * 1000) - (totalStayMinutes * 60000));
  }

  return processOptimizationResponse(
    data, start, end, orderedViaPoints, actualStartTime, duration, distance, debug, timeMode, cleanTargetTime
  );
};

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

  let fareInfo = { toll: 0, taxi: 0, fuel: 0 };
  if (data.features && data.features.length > 0) {
    const props = data.features[0].properties;
    fareInfo.toll = Number(props.totalFare || 0);
    fareInfo.taxi = Number(props.taxiFare || 0);
    fareInfo.fuel = Number(props.fuelPrice || 0);
  }

  const totalDistance = apiDistance;
  const features = data.features || [];

  // [핵심 3] 스케일링 로직
  let segmentSum = 0;
  features.forEach(f => {
    if (f.geometry.type === 'LineString') {
      segmentSum += Number(f.properties.time || 0);
    }
  });

  const scaleRatio = (segmentSum > 0 && apiDuration > 0) ? (apiDuration / segmentSum) : 1;

  const calculationLogs: string[] = [];
  calculationLogs.push(`=== Calculation Start ===`);
  calculationLogs.push(`Start Time: ${formatIsoStringKST(calculatedStartTime)}`);
  calculationLogs.push(`API Total Duration: ${apiDuration}s`);
  calculationLogs.push(`Sum of Segments: ${segmentSum}s`);
  calculationLogs.push(`Scale Ratio: ${scaleRatio.toFixed(4)}`);

  // [Step 1] Initial Sort by Index
  const indexedFeatures = features.map((f, i) => ({ ...f, _originalIndex: i }));
  const sortedFeatures = indexedFeatures.sort((a, b) => {
    const propsA = a.properties;
    const propsB = b.properties;

    if (propsA.pointType === 'S') return -1;
    if (propsB.pointType === 'S') return 1;
    if (propsA.pointType === 'E') return 1;
    if (propsB.pointType === 'E') return -1;

    const idxA = propsA.index;
    const idxB = propsB.index;
    const hasIdxA = idxA !== undefined && idxA !== null;
    const hasIdxB = idxB !== undefined && idxB !== null;

    if (hasIdxA && hasIdxB) {
      const numA = Number(idxA);
      const numB = Number(idxB);

      if (numA !== numB) return numA - numB;

      // Point < LineString
      const typeA = a.geometry.type;
      const typeB = b.geometry.type;
      if (typeA === 'Point' && typeB === 'LineString') return -1;
      if (typeA === 'LineString' && typeB === 'Point') return 1;
    }
    return a._originalIndex - b._originalIndex;
  });

  // [Step 2] Geometric Reordering (Distance Based) - 30m tolerance
  const isSameLocation = (c1: number[], c2: number[]) => {
    if (!c1 || !c2) return false;
    const distKm = getDistanceFromLatLonInKm(c1[1], c1[0], c2[1], c2[0]);
    return distKm < 0.03; // 30m
  };

  const reorderedFeatures = [...sortedFeatures];
  const pointsToReorder = reorderedFeatures.filter(f => f.geometry.type === 'Point');

  pointsToReorder.forEach(vp => {
    const vpCoords = vp.geometry.coordinates as number[];
    const currentVpIndex = reorderedFeatures.indexOf(vp);

    // Incoming Lines -> before Point
    const incomingLines = reorderedFeatures.filter(f =>
      f.geometry.type === 'LineString' &&
      f.geometry.coordinates &&
      isSameLocation((f.geometry.coordinates as number[][])[(f.geometry.coordinates as number[][]).length - 1] as number[], vpCoords)
    );

    incomingLines.forEach(line => {
      const lineIdx = reorderedFeatures.indexOf(line);
      if (lineIdx > currentVpIndex) {
        reorderedFeatures.splice(lineIdx, 1);
        const newVpIdx = reorderedFeatures.indexOf(vp);
        reorderedFeatures.splice(newVpIdx, 0, line);
      }
    });

    // Outgoing Lines -> after Point
    const outgoingLines = reorderedFeatures.filter(f =>
      f.geometry.type === 'LineString' &&
      f.geometry.coordinates &&
      isSameLocation((f.geometry.coordinates as number[][])[0] as number[], vpCoords)
    );

    const updatedVpIndex = reorderedFeatures.indexOf(vp);
    outgoingLines.forEach(line => {
      const lineIdx = reorderedFeatures.indexOf(line);
      if (lineIdx < updatedVpIndex) {
        reorderedFeatures.splice(lineIdx, 1);
        const newVpIdx = reorderedFeatures.indexOf(vp);
        reorderedFeatures.splice(newVpIdx + 1, 0, line);
      }
    });
  });

  const stops: OptimizedStop[] = [];
  const fullPath: { lat: number; lng: number }[] = [];
  const segments: RouteSegment[] = [];

  // Segment accumulators
  let currentSegmentDistance = 0;
  let currentSegmentTime = 0;

  // drivenSoFar: 실제로 지금까지 누적된 주행시간(스케일 적용된 라인 시간 합)
  let drivenSoFar = 0;

  // distanceSoFar: 지금까지 누적된 주행거리(라인 distance 합)
  let distanceSoFar = 0;

  const visitedViaIndices = new Set<number>();

  for (const feature of reorderedFeatures) {
    const props = feature.properties;

    if (feature.geometry.type === 'LineString') {
      const rawTime = Number(props.time || 0);
      const adjustedTime = rawTime * scaleRatio;

      drivenSoFar += adjustedTime;

      currentSegmentDistance += Number(props.distance || 0);
      currentSegmentTime += adjustedTime;

      distanceSoFar += Number(props.distance || 0);

      const coords = feature.geometry.coordinates as number[][];
      const segmentPath = coords.map(c => ({ lat: c[1], lng: c[0] }));
      fullPath.push(...segmentPath);

      const congestionVal = Number(props.congestion);
      segments.push({
        path: segmentPath,
        congestion: isNaN(congestionVal) ? 0 : congestionVal,
        color: getCongestionColor(congestionVal)
      });
    }
    else if (feature.geometry.type === 'Point') {
      const coords = feature.geometry.coordinates as number[];
      const pointType = props.pointType;
      const lat = Number(coords[1]);
      const lng = Number(coords[0]);

      if (pointType === 'S') {
        stops.push({
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

        currentSegmentDistance = 0;
        currentSegmentTime = 0;
      }
      else if (pointType === 'E') {
        // ✅ End Safety Net: "현재 세그먼트가 0인데 전체 주행시간은 남아있다"
        let finalSegTime = currentSegmentTime;
        let finalSegDist = currentSegmentDistance;

        if (finalSegTime <= 1 && apiDuration > 0) {
          // drivenSoFar는 End 이전까지 LineString에서 누적된 시간
          // 그런데 End가 LineString보다 먼저 나왔으면, drivenSoFar에 마지막 구간이 아직 안 들어있음
          const remainingTime = Math.max(0, apiDuration - drivenSoFar);
          if (remainingTime > 0) {
            finalSegTime = remainingTime;
          }

          const remainingDist = Math.max(0, totalDistance - distanceSoFar);
          if (remainingDist > 0) {
            finalSegDist = remainingDist;
          }
        }

        stops.push({
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

        currentSegmentDistance = 0;
        currentSegmentTime = 0;
      }
      else {
        let isVia = false;
        let matchedIndex = -1;

        const isPotentialVia = ['P', 'PP', 'Via', 'B1', 'B2', 'B3', 'B4', 'B5'].some(t => pointType && pointType.startsWith(t));

        if (isPotentialVia) {
          if (props.viaPointId) {
            matchedIndex = originalViaPoints.findIndex(vp => vp.id === props.viaPointId);
          }
          if (matchedIndex === -1) {
            matchedIndex = originalViaPoints.findIndex((vp, idx) => {
              if (visitedViaIndices.has(idx)) return false;
              const dist = getDistanceFromLatLonInKm(lat, lng, Number(vp.lat), Number(vp.lng));
              return dist < 0.05; // 50m
            });
          }
          if (matchedIndex !== -1) isVia = true;
        }

        if (isVia && !visitedViaIndices.has(matchedIndex)) {
          const original = originalViaPoints[matchedIndex];
          const currentStayTime = original.stayTime || 0;
          visitedViaIndices.add(matchedIndex);

          stops.push({
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

          currentSegmentDistance = 0;
          currentSegmentTime = 0;
        }
      }
    }
  }

  // [Step 3] Stop ordering: Start first, End last, Via keep extraction order
  const sortedStops = stops.sort((a, b) => {
    if (a.type === 'Start') return -1;
    if (b.type === 'Start') return 1;
    if (a.type === 'End') return 1;
    if (b.type === 'End') return -1;
    return 0;
  });

  // [Step 4] Sequential Time Recalculation
  let currentTimestamp = calculatedStartTime.getTime();

  const finalStops = sortedStops.map((stop, index) => {
    // ✅ Start는 travel 누적하지 않음
    if (stop.type !== 'Start') {
      const travelTimeSec = stop.durationFromPrevious || 0;
      currentTimestamp += travelTimeSec * 1000;
    }

    // arrival
    let arrivalDate = new Date(currentTimestamp);

    // ✅ arrival 모드면 End는 targetTime으로 강제 (UI 일관성)
    if (timeMode === 'arrival' && stop.type === 'End') {
      arrivalDate = targetTime;
      // arrival 모드에서는 전체 타임라인도 End에 맞춰야 하므로 timestamp를 맞춰줌
      currentTimestamp = targetTime.getTime();
    }

    stop.rawArrivalTime = arrivalDate.toISOString();
    stop.arrivalTime = formatTimeDisplay(arrivalDate);

    // departure (stay)
    if (stop.stayTime && stop.stayTime > 0) {
      const stayMs = stop.stayTime * 60 * 1000;
      currentTimestamp += stayMs;
      const departureDate = new Date(currentTimestamp);
      stop.departureTime = formatTimeDisplay(departureDate);
    }

    stop.sequence = index;
    return stop;
  });

  const totalDurationIncludingStay = (currentTimestamp - calculatedStartTime.getTime()) / 1000;

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
