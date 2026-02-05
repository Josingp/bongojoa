import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, POI_SEARCH_ENDPOINT } from '../constants';
import { Location, OptimizationRequest, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult } from '../types';

// Prediction API Endpoint
// Removed "sort=index" as it is not a documented parameter for Prediction API
const PREDICTION_ENDPOINT = "/routes/prediction?version=1&resCoordType=WGS84GEO&reqCoordType=WGS84GEO";

/**
 * Formats a Date object into YYYYMMDDHHmm required by TMAP Optimization API
 */
const formatOptimizationDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  
  return `${yyyy}${MM}${dd}${HH}${mm}`;
};

/**
 * Formats a Date object into ISO 8601 with KST offset (+0900) for Prediction API
 * Format: YYYY-MM-DDTHH:mm:ss+0900
 */
const formatPredictionDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  
  // TMAP is a Korean service, so we explicitly set +0900 (KST)
  // We assume the user's input time (local components) represents KST.
  return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}+0900`;
};

/**
 * Helper to format a Date object to "오전/오후 HH:mm" string
 */
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

/**
 * API Call for Prediction Route (Start -> End with Future Time)
 * Replaces the standard /routes call to support time prediction.
 */
async function fetchPredictionRoute(
  apiKey: string,
  start: Location,
  end: Location,
  startTime: Date
): Promise<{data: RouteResponse, duration: number, distance: number}> {
  const cleanKey = apiKey.trim();
  const predictionTime = formatPredictionDate(startTime);
  
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
      predictionType: "departure",
      predictionTime: predictionTime
      // Removed searchOption and tollgateCarType as they are not supported in routesInfo for Prediction API
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
     // Try to parse error text as JSON for better debugging
     try {
       const errorJson = JSON.parse(errorText);
       throw new Error(errorJson.error?.message || `Prediction API Error: ${response.status}`);
     } catch (e) {
       throw new Error(`Prediction API Error: ${response.status} - ${errorText}`);
     }
  }

  const data: RouteResponse = await response.json();
  
  // Prediction API returns totalTime/totalDistance in the first feature's properties
  let distance = 0;
  let duration = 0;
  
  if (data.features && data.features.length > 0) {
      // Ensure we cast to Number to avoid string concatenation issues later
      distance = Number(data.features[0].properties.totalDistance || 0);
      duration = Number(data.features[0].properties.totalTime || 0);
  }
  
  return { data, duration, distance };
}

/**
 * Low-level API call for Optimization (Start -> Vias -> End)
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

/**
 * Searches for POIs (Points of Interest) using TMAP API
 */
export const searchPois = async (apiKey: string, keyword: string): Promise<PoiItem[]> => {
  const cleanKey = apiKey.trim();
  const encodedKeyword = encodeURIComponent(keyword);
  
  // Construct URL with query params
  const url = `${TMAP_API_BASE}${POI_SEARCH_ENDPOINT}&searchKeyword=${encodedKeyword}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=20`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'appKey': cleanKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
       // TMAP returns 204 if no content found
       if (response.status === 204) return [];
       
       const errorText = await response.text();
       console.error(`POI Search API Error: ${response.status} - ${errorText}`);
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
  departureTime: Date
): Promise<OptimizationResult> => {

  const fixedFirstIndex = viaPoints.findIndex(p => p.isFixedFirst);
  
  // SCENARIO 1: Simple Route (No Vias) -> Use Prediction API
  if (viaPoints.length === 0) {
      const { data } = await fetchPredictionRoute(apiKey, start, end, departureTime);
      return processOptimizationResponse(data, start, end, [], departureTime);
  }

  // SCENARIO 2: Has Fixed First Point
  if (fixedFirstIndex !== -1) {
      const fixedPoint = viaPoints[fixedFirstIndex];
      const otherVias = viaPoints.filter((_, idx) => idx !== fixedFirstIndex);

      // Step A: Start -> Fixed Point (Using Prediction API)
      const leg1 = await fetchPredictionRoute(apiKey, start, fixedPoint, departureTime);
      
      // Calculate arrival time at Fixed Point
      const arrivalAtFixed = new Date(departureTime.getTime() + leg1.duration * 1000);
      
      // Step B: Fixed Point -> Remaining Vias -> End
      let leg2: { data: RouteResponse, duration: number, distance: number };
      
      if (otherVias.length === 0) {
          // If no remaining vias, use Prediction API for the second leg too
          leg2 = await fetchPredictionRoute(apiKey, fixedPoint, end, arrivalAtFixed);
      } else {
          // If remaining vias, use Optimization API
          leg2 = await fetchOptimization(apiKey, fixedPoint, end, otherVias, arrivalAtFixed);
      }

      // MERGE RESULTS
      return mergeRouteResults(
          leg1.data, 
          leg2.data, 
          start, 
          fixedPoint, 
          end, 
          otherVias, 
          departureTime, 
          leg1.duration
      );
  }

  // SCENARIO 3: Standard Optimization (No Fixed Point)
  const { data } = await fetchOptimization(apiKey, start, end, viaPoints, departureTime);
  return processOptimizationResponse(data, start, end, viaPoints, departureTime);
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

    const stops1 = res1.stops;
    const stops2 = res2.stops.slice(1); // Remove duplicate start point (Fixed Point)

    // Update sequence for fixed point
    const fixedStopIndex = stops1.length - 1;
    stops1[fixedStopIndex].type = 'Via';
    stops1[fixedStopIndex].sequence = 1; 
    stops1[fixedStopIndex].isFixed = true;

    // Update sequences for second leg
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
    let totalDuration = 0; // seconds
    let currentAccumulatedTime = 0; // seconds
    
    // Prediction API uses features[0].properties for total summary usually
    // Optimization API uses data.properties
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
            const distance = Number(feature.properties.distance || 0);
            
            // Only sum up if global properties weren't available
            // But for Prediction API, we rely on the totals from the first feature usually or properties if available
            // If data.properties is missing (like in some Prediction responses), we assume totals are passed in arg or extracted above.
            // Just accumulate time for relative arrival calculation.
            currentAccumulatedTime += time;
            
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
            
            if (props.pointType === 'S') {
                stops.push({
                    id: start.id,
                    name: start.name,
                    arrivalTime: formatTimeDisplay(startTime), 
                    rawArrivalTime: startTime.toISOString(),
                    type: 'Start',
                    sequence: 0,
                    lat: ptLat.toString(),
                    lng: ptLng.toString()
                });
            }
            else if (props.pointType === 'E') {
                 stops.push({
                    id: end.id,
                    name: end.name,
                    arrivalTime: formatTimeDisplay(arrivalDate),
                    rawArrivalTime: arrivalDate.toISOString(),
                    type: 'End',
                    sequence: 999,
                    lat: ptLat.toString(),
                    lng: ptLng.toString()
                });
            }
            else if (props.viaPointId || props.pointType === 'P' || props.pointType === 'PP') {
                const originalVia = originalViaPoints.find(v => v.id === props.viaPointId);
                const name = originalVia ? originalVia.name : (props.viaPointName || `Via ${viaSequenceCounter}`);

                stops.push({
                    id: props.viaPointId || `via_${viaSequenceCounter}`,
                    name: name,
                    arrivalTime: formatTimeDisplay(arrivalDate),
                    rawArrivalTime: arrivalDate.toISOString(),
                    type: 'Via',
                    sequence: viaSequenceCounter++,
                    lat: ptLat.toString(),
                    lng: ptLng.toString()
                });
            }
        }
    }
    
    stops.sort((a, b) => new Date(a.rawArrivalTime).getTime() - new Date(b.rawArrivalTime).getTime());

    stops.forEach((stop, idx) => {
        if (idx === 0) {
            stop.type = 'Start';
            stop.sequence = 0;
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

    // Fallback: If Start point was missing from features (Prediction API sometimes only gives Path or weird Points)
    if (stops.length === 0 || stops[0].type !== 'Start') {
         stops.unshift({
            id: start.id,
            name: start.name,
            arrivalTime: formatTimeDisplay(startTime),
            rawArrivalTime: startTime.toISOString(),
            type: 'Start',
            sequence: 0,
            lat: start.lat,
            lng: start.lng
         });
    }

    // Fallback: If End point was missing
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
            lng: end.lng
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