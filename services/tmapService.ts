import { TMAP_API_BASE, OPTIMIZATION_ENDPOINT, ROUTE_ENDPOINT, POI_SEARCH_ENDPOINT } from '../constants';
import { Location, OptimizationRequest, RouteResponse, OptimizedStop, PoiItem, PoiResponse, OptimizationResult } from '../types';

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
 * Helper to format a Date object to HH:mm string
 */
const formatTimeDisplay = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const optimizeRoute = async (
  apiKey: string,
  start: Location,
  end: Location,
  viaPoints: Location[],
  departureTime: Date
): Promise<OptimizationResult> => {
  const formattedStartTime = formatOptimizationDate(departureTime);
  const cleanKey = apiKey.trim();

  let endpoint = "";
  let payload = {};

  // BRANCH: If no via points, use standard Route API. 
  // Optimization API throws 400 if viaPoints is empty or invalid.
  if (viaPoints.length === 0) {
    endpoint = ROUTE_ENDPOINT;
    payload = {
      startX: start.lng,
      startY: start.lat,
      endX: end.lng,
      endY: end.lat,
      reqCoordType: "WGS84GEO",
      resCoordType: "WGS84GEO",
      searchOption: "0", // 0: Recommended (Fastest)
      trafficInfo: "Y"   // Use real-time/predicted traffic if available
    };
  } else {
    endpoint = OPTIMIZATION_ENDPOINT;
    payload = {
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
  }

  try {
    const response = await fetch(`${TMAP_API_BASE}${endpoint}`, {
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
          const jsonError = JSON.parse(errorText);
          throw new Error(`API Error: ${response.status} - ${jsonError?.error?.message || jsonError?.message || errorText}`);
      } catch (e) {
          throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
    }

    const data: RouteResponse = await response.json();
    return processOptimizationResponse(data, start, end, viaPoints, departureTime);
  } catch (error) {
    console.error("Route calculation failed:", error);
    throw error;
  }
};

export const searchPois = async (apiKey: string, keyword: string): Promise<PoiItem[]> => {
  if (!keyword) return [];
  const cleanKey = apiKey.trim();

  const params = new URLSearchParams({
    searchKeyword: keyword,
    searchType: 'all',
    page: '1',
    count: '20',
    resCoordType: 'WGS84GEO',
    multiPoint: 'N',
    searchtypCd: 'A',
    reqCoordType: 'WGS84GEO',
    poiGroupYn: 'N'
  });

  try {
    const response = await fetch(`${TMAP_API_BASE}${POI_SEARCH_ENDPOINT}&${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'appKey': cleanKey
      }
    });

    if (!response.ok) {
      throw new Error(`Search Error: ${response.status}`);
    }

    const data: PoiResponse = await response.json();
    return data.searchPoiInfo?.pois?.poi || [];
  } catch (error) {
    console.error("POI Search failed:", error);
    return [];
  }
};

const processOptimizationResponse = (
    data: RouteResponse, 
    start: Location, 
    end: Location, 
    originalViaPoints: Location[], 
    startTime: Date
): OptimizationResult => {
    
    // TMAP Optimization API returns features in the OPTIMIZED order.
    // Standard Route API returns features in Start->End order.

    let totalDistance = 0;
    let totalDuration = 0; // seconds
    let currentAccumulatedTime = 0; // seconds
    
    // Attempt to get global properties if available, otherwise sum up
    if (data.properties) {
       totalDistance = data.properties.totalDistance || 0;
       totalDuration = data.properties.totalTime || 0;
    }

    const stops: OptimizedStop[] = [];
    const path: { lat: number; lng: number }[] = [];
    
    let viaSequenceCounter = 1;

    for (const feature of data.features) {
        // Handle Geometry for Map
        if (feature.geometry.type === 'LineString') {
            const time = Number(feature.properties.time || 0);
            const distance = Number(feature.properties.distance || 0);
            
            // Only sum up if global properties weren't available
            if (!data.properties) {
                totalDistance += distance;
                totalDuration += time;
            }

            currentAccumulatedTime += time;
            
            // Collect path coordinates (GeoJSON is [lng, lat])
            const coords = feature.geometry.coordinates as number[][];
            coords.forEach(c => {
                path.push({ lat: c[1], lng: c[0] });
            });
        } 
        
        // Handle Points for Stops
        else if (feature.geometry.type === 'Point') {
            const props = feature.properties;
            const coords = feature.geometry.coordinates as number[];
            const ptLat = coords[1];
            const ptLng = coords[0];
            const arrivalDate = new Date(startTime.getTime() + currentAccumulatedTime * 1000);
            
            // Type 'S': Start
            if (props.pointType === 'S') {
                stops.push({
                    id: start.id,
                    name: start.name,
                    arrivalTime: formatTimeDisplay(startTime), // Start time
                    rawArrivalTime: startTime.toISOString(),
                    type: 'Start',
                    sequence: 0,
                    lat: ptLat.toString(),
                    lng: ptLng.toString()
                });
            }
            // Type 'E': End
            else if (props.pointType === 'E') {
                 stops.push({
                    id: end.id,
                    name: end.name,
                    arrivalTime: formatTimeDisplay(arrivalDate),
                    rawArrivalTime: arrivalDate.toISOString(),
                    type: 'End',
                    sequence: 999, // Placeholder sequence, will be fixed below
                    lat: ptLat.toString(),
                    lng: ptLng.toString()
                });
            }
            // Type 'P' (Pass) or 'PP' (Via) or if it has a viaPointId
            // Note: TMap sometimes includes other point types for guidance, we filter for known via types or IDs
            else if (props.viaPointId || props.pointType === 'P' || props.pointType === 'PP') {
                // Find original info if possible using ID
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
    
    // Sort stops by arrival time/sequence to be safe
    // TMap features are usually ordered, but robust sorting helps.
    stops.sort((a, b) => new Date(a.rawArrivalTime).getTime() - new Date(b.rawArrivalTime).getTime());

    // Normalize sequence numbers and types
    stops.forEach((stop, idx) => {
        // Start is always 0
        if (idx === 0) {
            stop.type = 'Start';
            stop.sequence = 0;
        } 
        // End is always last
        else if (idx === stops.length - 1) {
            stop.type = 'End';
            stop.sequence = 999; 
        } 
        // Vias are 1, 2, 3...
        else {
            stop.type = 'Via';
            stop.sequence = idx; // 1-based index because Start is 0
        }
    });

    // Fallback: If Start point was missing from features (rare for TMAP), prepend it
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

    // Fallback: If End point was missing (simple route sometimes doesn't label it 'E' in features explicitly)
    if (stops.length > 0 && stops[stops.length-1].type !== 'End') {
        stops.push({
            id: end.id,
            name: end.name,
            arrivalTime: formatTimeDisplay(new Date(startTime.getTime() + totalDuration * 1000)),
            rawArrivalTime: new Date(startTime.getTime() + totalDuration * 1000).toISOString(),
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