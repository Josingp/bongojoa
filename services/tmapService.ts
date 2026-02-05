import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT } from '../constants';
import { Location, OptimizationRequest, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult } from '../types';

// Prediction API Endpoint
const PREDICTION_ENDPOINT = "/routes/prediction?version=1&resCoordType=WGS84GEO&reqCoordType=WGS84GEO";

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
    
    let guessStart = new Date(targetArrival.getTime() - 60 * 60 * 1000); 
    
    const MAX_ITERATIONS = 5;
    const TOLERANCE_MS = 60 * 1000; // 1 minute

    let bestResult: { data: RouteResponse, calculatedStart: Date, duration: number } | null = null;
    let minDiffMs = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const res = await fetchOptimization(apiKey, start, end, viaPoints, guessStart);
        
        const durationMs = res.duration * 1000;
        const actualArrival = new Date(guessStart.getTime() + durationMs);
        
        const diffMs = actualArrival.getTime() - targetArrival.getTime();
        
        if (Math.abs(diffMs) < Math.abs(minDiffMs)) {
            minDiffMs = diffMs;
            bestResult = {
                data: res.data,
                calculatedStart: guessStart,
                duration: res.duration
            };
        }

        if (Math.abs(diffMs) <= TOLERANCE_MS) {
            return {
                data: res.data,
                calculatedStart: guessStart,
                duration: res.duration
            };
        }

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
  
  if (viaPoints.length === 0) {
      const { data, duration } = await fetchPredictionRoute(apiKey, start, end, targetTime, timeMode);
      
      let calculatedStartTime = targetTime;
      if (timeMode === 'arrival') {
        calculatedStartTime = new Date(targetTime.getTime() - duration * 1000);
      }

      return processOptimizationResponse(data, start, end, [], calculatedStartTime);
  }

  if (fixedFirstIndex !== -1) {
      const fixedPoint = viaPoints[fixedFirstIndex];
      const otherVias = viaPoints.filter((_, idx) => idx !== fixedFirstIndex);

      if (timeMode === 'arrival') {
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

         const leg1 = await fetchPredictionRoute(apiKey, start, fixedPoint, arrivalAtFixed, 'arrival');
         const actualStart = new Date(arrivalAtFixed.getTime() - leg1.duration * 1000);

         return mergeRouteResults(leg1.data, leg2Res.data, start, fixedPoint, end, otherVias, actualStart, leg1.duration);
      }

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

  if (timeMode === 'arrival') {
      const { data, calculatedStart } = await findOptimalDepartureTimeForOptimization(apiKey, start, end, viaPoints, targetTime);
      return processOptimizationResponse(data, start, end, viaPoints, calculatedStart);
  }

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
    const res1 = processOptimizationResponse(r1, start, fixedPoint, [], startTime);
    const startTimeLeg2 = new Date(startTime.getTime() + leg1Duration * 1000);
    const res2 = processOptimizationResponse(r2, fixedPoint, end, otherVias, startTimeLeg2);

    // Filter duplicates: The end of res1 is the start of res2 (the fixed point)
    // res1.stops: [Start, FixedPoint]
    // res2.stops: [FixedPoint, ..., End]
    
    // 1. Remove FixedPoint from res1 stops to avoid duplicate "arrival time" logic, 
    // OR ensure res2 starts with the fixed point correctly.
    // The previous implementation used slice on res2, which is correct.
    const stops1 = res1.stops;
    const stops2 = res2.stops.slice(1); // Skip the first point of Leg2 (which is the fixed point)

    // Ensure the Fixed Point in stops1 is marked properly
    const fixedStopIndex = stops1.length - 1;
    stops1[fixedStopIndex].type = 'Via';
    stops1[fixedStopIndex].sequence = 1; 
    stops1[fixedStopIndex].isFixed = true;
    // Important: Carry over duration info. 
    // Leg1 End (FixedPoint) arrival time is calculated in res1.
    // Leg2 Start (FixedPoint) arrival time is essentially the same.

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
    let currentAccumulatedTime = 0; // Total time from start
    let currentSegmentTime = 0;     // Time from previous stop
    
    if (data.properties) {
       totalDistance = Number(data.properties.totalDistance || 0);
       totalDuration = Number(data.properties.totalTime || 0);
    } else if (data.features && data.features.length > 0) {
       totalDistance = Number(data.features[0].properties.totalDistance || 0);
       totalDuration = Number(data.features[0].properties.totalTime || 0);
    }

    const stops: OptimizedStop[] = [];
    const path: { lat: number; lng: number }[] = [];
    
    let viaSequenceCounter = 1;

    for (const feature of data.features) {
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
            const arrivalDate = new Date(startTime.getTime() + currentAccumulatedTime * 1000);
            
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
                durationFromPrevious: type === 'Start' ? 0 : currentSegmentTime // Save segment duration
            });

            if (props.pointType === 'S') {
                stops.push(createStop(start.id, start.name, 'Start', 0));
                // Reset segment time because we are at a stop
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
    
    stops.sort((a, b) => new Date(a.rawArrivalTime).getTime() - new Date(b.rawArrivalTime).getTime());

    // Sanity Checks & Cleanup
    stops.forEach((stop, idx) => {
        if (idx === 0) {
            stop.type = 'Start';
            stop.sequence = 0;
            stop.durationFromPrevious = 0; // Start has no previous
        } 
        else if (idx === stops.length - 1) {
            stop.type = 'End';
            stop.sequence = 999; 
        } 
        else {
            stop.type = 'Via';
            stop.sequence = idx; 
        }
    });

    // Fallback if Start is missing (Sometimes API structure is weird)
    if (stops.length === 0 || stops[0].type !== 'Start') {
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
    }

    // Fallback if End is missing
    if (stops.length > 0 && stops[stops.length-1].type !== 'End') {
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
            durationFromPrevious: currentSegmentTime // Might be remaining time
        });
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