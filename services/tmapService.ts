import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT } from '../constants';
import { Location, OptimizationRequest, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult, GeoJSONFeature } from '../types';

// Prediction API Endpoint
const PREDICTION_ENDPOINT = "/routes/prediction?version=1&resCoordType=WGS84GEO&reqCoordType=WGS84GEO";
const REVERSE_GEO_ENDPOINT = "/geo/reversegeocoding?version=1&addressType=A10&coordType=WGS84GEO";

const formatOptimizationDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  
  return `${yyyy}${MM}${dd}${HH}${mm}`;
};

const formatPredictionDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  
  return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}+0900`;
};

const formatTimeDisplay = (date: Date): string => {
  let hour = date.getHours();
  const minute = date.getMinutes();
  const ampm = hour >= 12 ? '오후' : '오전';
  
  hour = hour % 12;
  hour = hour ? hour : 12; 
  
  const padMin = minute.toString().padStart(2, '0');
  const padHour = hour.toString().padStart(2, '0');
  
  return `${ampm} ${padHour}:${padMin}`;
};

// ---------------------------------------------------------
// Core API Fetch Functions
// ---------------------------------------------------------

export const getAddressFromCoords = async (apiKey: string, lat: number, lng: number): Promise<string> => {
  const cleanKey = apiKey.trim();
  try {
    const response = await fetch(`${TMAP_API_BASE}${REVERSE_GEO_ENDPOINT}&lat=${lat}&lon=${lng}`, {
      method: 'GET',
      headers: { 'appKey': cleanKey, 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return "선택된 위치";
    }

    const data = await response.json();
    if (data.addressInfo && data.addressInfo.fullAddress) {
      return data.addressInfo.fullAddress;
    }
    return "알 수 없는 위치";
  } catch (e) {
    console.error("Reverse Geocoding Failed", e);
    return "위치 정보 불러오기 실패";
  }
};

async function fetchPredictionRoute(
  apiKey: string,
  start: Location,
  end: Location,
  targetTime: Date,
  timeMode: 'departure' | 'arrival' = 'departure'
): Promise<{data: RouteResponse, duration: number, distance: number}> {
  const cleanKey = apiKey.trim();
  const formattedTime = formatPredictionDate(targetTime);
  
  const payload = {
    routesInfo: {
      departure: {
        name: start.name || "Start",
        lon: start.lng,
        lat: start.lat
      },
      destination: {
        name: end.name || "End",
        lon: end.lng,
        lat: end.lat
      },
      predictionType: timeMode,
      predictionTime: formattedTime
    }
  };

  const response = await fetch(`${TMAP_API_BASE}${PREDICTION_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'appKey': cleanKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
  });

  if (!response.ok) {
     const errorText = await response.text();
     try {
       const errorJson = JSON.parse(errorText);
       throw new Error(errorJson.error?.message || `Prediction API Error: ${response.status}`);
     } catch (e) {
       throw new Error(`Prediction API Error: ${response.status} - ${errorText}`);
     }
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
      startName: start.name || "Start",
      startX: start.lng,
      startY: start.lat,
      startTime: formattedStartTime,
      endName: end.name || "End",
      endX: end.lng,
      endY: end.lat,
      searchOption: "0",
      viaPoints: viaPoints.map(p => ({
        viaPointId: p.id,
        viaPointName: p.name,
        viaX: p.lng,
        viaY: p.lat
      }))
    } as OptimizationRequest;

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
        const errorText = await response.text();
        throw new Error(`Optimization API Error: ${response.status} - ${errorText}`);
    }

    const data: RouteResponse = await response.json();
    let distance = 0;
    let duration = 0;
    if (data.properties) {
        distance = Number(data.properties.totalDistance || 0);
        duration = Number(data.properties.totalTime || 0);
    }
    return { data, duration, distance };
}

// ---------------------------------------------------------
// Iterative Optimization Solver (Smart Reverse Calculation)
// ---------------------------------------------------------

async function findOptimalDepartureTimeForOptimization(
    apiKey: string,
    start: Location,
    end: Location,
    viaPoints: Location[],
    targetArrival: Date
): Promise<{ data: RouteResponse, calculatedStart: Date, duration: number }> {
    
    // Initial guess: Target - 1 hour (Average urban trip)
    let guessStart = new Date(targetArrival.getTime() - 60 * 60 * 1000); 
    
    const MAX_ITERATIONS = 5;
    const TOLERANCE_MS = 60 * 1000; // 1 minute accuracy

    let bestResult: { data: RouteResponse, calculatedStart: Date, duration: number } | null = null;
    let minDiffMs = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const res = await fetchOptimization(apiKey, start, end, viaPoints, guessStart);
        
        const durationMs = res.duration * 1000;
        const actualArrival = new Date(guessStart.getTime() + durationMs);
        
        const diffMs = actualArrival.getTime() - targetArrival.getTime();
        
        // Save best result so far
        if (Math.abs(diffMs) < Math.abs(minDiffMs)) {
            minDiffMs = diffMs;
            bestResult = {
                data: res.data,
                calculatedStart: guessStart,
                duration: res.duration
            };
        }

        // Within tolerance? Return immediately
        if (Math.abs(diffMs) <= TOLERANCE_MS) {
            return {
                data: res.data,
                calculatedStart: guessStart,
                duration: res.duration
            };
        }

        // Adjust guess for next iteration
        // If we arrived too late (diff > 0), we need to leave earlier.
        guessStart = new Date(guessStart.getTime() - diffMs);
    }

    if (!bestResult) {
        throw new Error("Could not calculate optimal start time within retry limits.");
    }
    
    return bestResult;
}


export const searchPois = async (apiKey: string, keyword: string): Promise<PoiItem[]> => {
  const cleanKey = apiKey.trim();
  const encodedKeyword = encodeURIComponent(keyword);
  const url = `${TMAP_API_BASE}${POI_SEARCH_ENDPOINT}&searchKeyword=${encodedKeyword}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=20`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'appKey': cleanKey, 'Accept': 'application/json' }
    });

    if (!response.ok) {
       if (response.status === 204) return [];
       return [];
    }

    const data: PoiResponse = await response.json();
    if (data.searchPoiInfo && data.searchPoiInfo.pois && data.searchPoiInfo.pois.poi) {
        return data.searchPoiInfo.pois.poi;
    }
    return [];
  } catch (error) {
    console.error("POI Search Failed:", error);
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

  const fixedFirstIndex = viaPoints.findIndex(p => p.isFixedFirst);
  
  // Case 1: Simple Route (No Via Points)
  if (viaPoints.length === 0) {
      const { data, duration } = await fetchPredictionRoute(apiKey, start, end, targetTime, timeMode);
      
      let calculatedStartTime = targetTime;
      if (timeMode === 'arrival') {
        calculatedStartTime = new Date(targetTime.getTime() - duration * 1000);
      }

      return processOptimizationResponse(data, start, end, [], calculatedStartTime);
  }

  // Case 2: Fixed First Point
  if (fixedFirstIndex !== -1) {
      const fixedPoint = viaPoints[fixedFirstIndex];
      const otherVias = viaPoints.filter((_, idx) => idx !== fixedFirstIndex);

      if (timeMode === 'arrival') {
         // Leg 2: Fixed -> End (Arrive at targetTime)
         let leg2Res;
         if (otherVias.length === 0) {
             const res = await fetchPredictionRoute(apiKey, fixedPoint, end, targetTime, 'arrival');
             leg2Res = { 
                data: res.data, 
                calculatedStart: new Date(targetTime.getTime() - res.duration * 1000), 
                duration: res.duration 
             };
         } else {
             leg2Res = await findOptimalDepartureTimeForOptimization(apiKey, fixedPoint, end, otherVias, targetTime);
         }

         const arrivalAtFixed = leg2Res.calculatedStart;

         // Leg 1: Start -> Fixed (Arrive at Fixed Arrival Time)
         const leg1 = await fetchPredictionRoute(apiKey, start, fixedPoint, arrivalAtFixed, 'arrival');
         const actualStart = new Date(arrivalAtFixed.getTime() - leg1.duration * 1000);

         return mergeRouteResults(leg1.data, leg2Res.data, start, fixedPoint, end, otherVias, actualStart, leg1.duration);
      }

      // Departure Mode with Fixed Point
      const leg1 = await fetchPredictionRoute(apiKey, start, fixedPoint, targetTime, 'departure');
      const arrivalAtFixed = new Date(targetTime.getTime() + leg1.duration * 1000);
      
      let leg2: { data: RouteResponse, duration: number, distance: number };
      if (otherVias.length === 0) {
          leg2 = await fetchPredictionRoute(apiKey, fixedPoint, end, arrivalAtFixed, 'departure');
      } else {
          leg2 = await fetchOptimization(apiKey, fixedPoint, end, otherVias, arrivalAtFixed);
      }

      return mergeRouteResults(leg1.data, leg2.data, start, fixedPoint, end, otherVias, targetTime, leg1.duration);
  }

  // Case 3: Normal Optimization (Arrival Mode)
  if (timeMode === 'arrival') {
      const { data, calculatedStart } = await findOptimalDepartureTimeForOptimization(apiKey, start, end, viaPoints, targetTime);
      return processOptimizationResponse(data, start, end, viaPoints, calculatedStart);
  }

  // Case 4: Normal Optimization (Departure Mode)
  const { data } = await fetchOptimization(apiKey, start, end, viaPoints, targetTime);
  return processOptimizationResponse(data, start, end, viaPoints, targetTime);
};

// ---------------------------------------------------------
// Helper: Merge Two Route Responses
// ---------------------------------------------------------
function mergeRouteResults(
    r1: RouteResponse, 
    r2: RouteResponse,
    start: Location,
    fixedPoint: Location,
    end: Location,
    otherVias: Location[],
    startTime: Date,
    leg1Duration: number
): OptimizationResult {
    // Process first leg
    const res1 = processOptimizationResponse(r1, start, fixedPoint, [], startTime);
    
    // Process second leg
    // Note: startTimeLeg2 must be the exact arrival time at the fixed point from Leg 1
    const startTimeLeg2 = new Date(startTime.getTime() + leg1Duration * 1000);
    const res2 = processOptimizationResponse(r2, fixedPoint, end, otherVias, startTimeLeg2);

    const stops1 = res1.stops;
    // Remove the first point of Leg 2 (Fixed Point) because it's the last point of Leg 1
    const stops2 = res2.stops.slice(1); 

    // Update the Fixed Point in stops1 to be 'Via' instead of 'End'
    const fixedStopIndex = stops1.length - 1;
    stops1[fixedStopIndex].type = 'Via';
    stops1[fixedStopIndex].sequence = 1; 
    stops1[fixedStopIndex].isFixed = true;

    // Adjust sequences for stops2
    stops2.forEach((s, i) => {
        if (s.type === 'End') {
            s.sequence = 999;
        } else {
            s.sequence = i + 2;
        }
    });

    const mergedStops = [...stops1, ...stops2];
    const mergedPath = [...res1.path, ...res2.path];
    const totalDistance = res1.summary.totalDistance + res2.summary.totalDistance;
    const totalDuration = res1.summary.totalDuration + res2.summary.totalDuration;

    return {
        stops: mergedStops,
        path: mergedPath,
        summary: { totalDistance, totalDuration }
    };
}


// ---------------------------------------------------------
// Helper: Process Single Response
// ---------------------------------------------------------
const processOptimizationResponse = (
    data: RouteResponse, 
    start: Location, 
    end: Location, 
    originalViaPoints: Location[], 
    startTime: Date
): OptimizationResult => {
    
    let totalDistance = 0;
    let totalDuration = 0; 
    
    // 1. Get Total Summary from Properties
    if (data.properties) {
       totalDistance = Number(data.properties.totalDistance || 0);
       totalDuration = Number(data.properties.totalTime || 0);
    } else if (data.features && data.features.length > 0) {
       totalDistance = Number(data.features[0].properties.totalDistance || 0);
       totalDuration = Number(data.features[0].properties.totalTime || 0);
    }

    // 2. CRITICAL: Sort Features by Index
    // Safeguard against missing features using || []
    const features = data.features || [];
    const sortedFeatures = [...features].sort((a, b) => {
        return (a.properties.index || 0) - (b.properties.index || 0);
    });

    const stops: OptimizedStop[] = [];
    const path: { lat: number; lng: number }[] = [];
    
    let currentAccumulatedTime = 0; // Total time from start
    let currentSegmentTime = 0;     // Time from previous stop to current point
    let viaSequenceCounter = 1;

    for (const feature of sortedFeatures) {
        if (feature.geometry.type === 'LineString') {
            const time = Number(feature.properties.time || 0);
            currentAccumulatedTime += time;
            currentSegmentTime += time;
            
            const coords = feature.geometry.coordinates as number[][];
            coords.forEach(c => {
                path.push({ lat: c[1], lng: c[0] });
            });
        } 
        
        else if (feature.geometry.type === 'Point') {
            const props = feature.properties;
            const coords = feature.geometry.coordinates as number[];
            const ptLat = coords[1];
            const ptLng = coords[0];
            
            // Calculate Arrival Time
            let arrivalDate = new Date(startTime.getTime() + currentAccumulatedTime * 1000);
            
            // Force Start Point to match startTime exactly (Accumulated time should be 0, but safe guard)
            if (props.pointType === 'S') {
                arrivalDate = startTime;
                currentAccumulatedTime = 0; // Reset just in case
            }
            // Force End Point to match startTime + totalDuration
            else if (props.pointType === 'E') {
                arrivalDate = new Date(startTime.getTime() + totalDuration * 1000);
            }

            // Helper to create stop object
            const createStop = (
              id: string, 
              name: string, 
              type: 'Start' | 'Via' | 'End', 
              seq: number
            ): OptimizedStop => ({
                id,
                name,
                arrivalTime: formatTimeDisplay(arrivalDate), 
                rawArrivalTime: arrivalDate.toISOString(),
                type,
                sequence: seq,
                lat: ptLat.toString(),
                lng: ptLng.toString(),
                durationFromPrevious: type === 'Start' ? 0 : currentSegmentTime
            });

            if (props.pointType === 'S') {
                stops.push(createStop(start.id, start.name, 'Start', 0));
                currentSegmentTime = 0;
            }
            else if (props.pointType === 'E') {
                 stops.push(createStop(end.id, end.name, 'End', 999));
                 currentSegmentTime = 0;
            }
            else if (props.viaPointId || props.pointType === 'P' || props.pointType === 'PP') {
                const originalVia = originalViaPoints.find(v => v.id === props.viaPointId);
                const name = originalVia ? originalVia.name : (props.viaPointName || `Via ${viaSequenceCounter}`);
                
                stops.push(createStop(
                    props.viaPointId || `via_${viaSequenceCounter}`,
                    name,
                    'Via',
                    viaSequenceCounter++
                ));
                currentSegmentTime = 0;
            }
        }
    }
    
    // Sort stops just to be sure, though feature sorting handles it mostly
    stops.sort((a, b) => a.sequence - b.sequence);

    // Sanity Checks & Fallbacks
    if (stops.length > 0) {
        // Ensure Start is first and formatted
        const firstStop = stops[0];
        if (firstStop.type !== 'Start') {
            // Missing start point fix
            stops.unshift({
                id: start.id,
                name: start.name,
                arrivalTime: formatTimeDisplay(startTime),
                rawArrivalTime: startTime.toISOString(),
                type: 'Start',
                sequence: 0,
                lat: start.lat,
                lng: start.lng,
                durationFromPrevious: 0
            });
        } else {
            // Guarantee Start Time is exactly what we passed in
            firstStop.arrivalTime = formatTimeDisplay(startTime);
            firstStop.rawArrivalTime = startTime.toISOString();
            firstStop.durationFromPrevious = 0;
        }

        // Ensure End is last
        const lastStop = stops[stops.length - 1];
        if (lastStop.type !== 'End') {
            const finalArrival = new Date(startTime.getTime() + totalDuration * 1000);
            stops.push({
                id: end.id,
                name: end.name,
                arrivalTime: formatTimeDisplay(finalArrival),
                rawArrivalTime: finalArrival.toISOString(),
                type: 'End',
                sequence: 999,
                lat: end.lat,
                lng: end.lng,
                durationFromPrevious: currentSegmentTime
            });
        }
    } else {
        // Fallback if no stops parsed (e.g. no features)
        // Manually create Start -> End
        stops.push({
            id: start.id,
            name: start.name,
            arrivalTime: formatTimeDisplay(startTime),
            rawArrivalTime: startTime.toISOString(),
            type: 'Start',
            sequence: 0,
            lat: start.lat,
            lng: start.lng,
            durationFromPrevious: 0
        });
        const finalArrival = new Date(startTime.getTime() + totalDuration * 1000);
        stops.push({
            id: end.id,
            name: end.name,
            arrivalTime: formatTimeDisplay(finalArrival),
            rawArrivalTime: finalArrival.toISOString(),
            type: 'End',
            sequence: 999,
            lat: end.lat,
            lng: end.lng,
            durationFromPrevious: totalDuration
        });
        
        // Add manual line if path is empty
        if (path.length === 0) {
            path.push({ lat: parseFloat(start.lat), lng: parseFloat(start.lng) });
            path.push({ lat: parseFloat(end.lat), lng: parseFloat(end.lng) });
        }
    }

    return {
        stops,
        summary: {
            totalDistance,
            totalDuration
        },
        path
    };
};