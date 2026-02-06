import React, { useEffect, useRef, useState } from 'react';
import { OptimizationResult } from '../types';

interface RouteMapProps {
  result: OptimizationResult;
  apiKey: string;
}

declare global {
  interface Window {
    Tmapv2: any;
  }
}

// Helper to create SVG Marker Data URI
const createMarkerIcon = (type: 'Start' | 'End' | 'Via', sequence?: number) => {
  let color = '#2563eb'; // Blue for Via
  let text = sequence?.toString() || '';
  
  if (type === 'Start') {
    color = '#16a34a'; // Green
    text = 'S';
  } else if (type === 'End') {
    color = '#dc2626'; // Red
    text = 'E';
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
      <defs>
        <filter id="shadow" x="-50%" y="-20%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
          <feOffset dx="0" dy="2" result="offsetblur"/>
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.3"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <path fill="${color}" d="M18 0C8.06 0 0 8.06 0 18c0 11 18 30 18 30s18-19 18-30c0-9.94-8.06-18-18-18z" filter="url(#shadow)" stroke="white" stroke-width="1.5"/>
      <circle cx="18" cy="18" r="10" fill="white" opacity="0.9"/>
      <text x="18" y="23" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="${color}" text-anchor="middle">${text}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const RouteMap: React.FC<RouteMapProps> = ({ result, apiKey }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  // Use a stable ID for the map container to avoid React reconciliation issues
  const mapIdRef = useRef(`map_div_${Math.random().toString(36).substr(2, 9)}`);
  
  const tmapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isLibLoaded, setIsLibLoaded] = useState(false);

  // 1. Script Loading & Polling Logic
  useEffect(() => {
    if (!apiKey) {
      setMapError("TMAP API Key가 설정되지 않았습니다.");
      return;
    }

    // Immediate check if already loaded
    if (window.Tmapv2 && window.Tmapv2.Map && typeof window.Tmapv2.LatLng === 'function') {
      setIsLibLoaded(true);
      return;
    }

    const scriptId = 'tmap-jssdk';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    // Check if script is already present; if not, add it
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
      script.async = true;
      document.head.appendChild(script);
    }

    // Polling to ensure Tmapv2 AND LatLng constructor are ready
    let pollCount = 0;
    const maxPolls = 100; // Increased to 10 seconds (100ms * 100) for slow networks

    const pollTmap = () => {
      if (window.Tmapv2 && window.Tmapv2.Map && typeof window.Tmapv2.LatLng === 'function') {
        setIsLibLoaded(true);
        setMapError(null);
      } else if (pollCount < maxPolls) {
        pollCount++;
        setTimeout(pollTmap, 100);
      } else {
        // Only set error if we still don't have it
        if (!window.Tmapv2) {
           setMapError("TMAP 라이브러리 로드 시간 초과. 페이지를 새로고침 하거나 네트워크/API 키를 확인해주세요.");
        }
      }
    };

    pollTmap();

    return () => {
       // Optional: could cancel timeout here if we stored the timer ID
    };
  }, [apiKey]);

  // 2. Map Initialization
  useEffect(() => {
    // Only proceed if library is fully loaded and map container exists
    if (!isLibLoaded || !mapRef.current) return;
    
    // If map already exists, don't re-create
    if (tmapRef.current) return;

    try {
      // Validate result data before use
      if (!result.stops || result.stops.length === 0) {
          throw new Error("경로 데이터가 올바르지 않습니다.");
      }

      const initialLat = parseFloat(result.stops[0].lat) || 37.5665;
      const initialLng = parseFloat(result.stops[0].lng) || 126.9780;

      // Ensure the container is empty before initializing
      if (mapRef.current.childElementCount > 0) {
        mapRef.current.innerHTML = "";
      }

      // Initialize Map using the DOM element directly instead of ID string
      // This is safer in React environments
      tmapRef.current = new window.Tmapv2.Map(mapRef.current, {
        center: new window.Tmapv2.LatLng(initialLat, initialLng),
        width: "100%",
        height: "100%",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true
      });
    } catch (e: any) {
      console.error("Map creation error:", e);
      setMapError(`지도 생성 오류: ${e.message}`);
    }

    // Cleanup function when component unmounts
    return () => {
        if (tmapRef.current) {
            // TMAP doesn't always have destroy, but we clear refs
            tmapRef.current = null;
        }
        if (mapRef.current) {
            // Force clear the container
            mapRef.current.innerHTML = "";
        }
        polylineRef.current = null;
        markersRef.current = [];
    };
  }, [isLibLoaded]); // Only runs when lib is loaded

  // 3. Draw Route & Markers
  useEffect(() => {
    if (!tmapRef.current || !isLibLoaded || !result) return;

    const map = tmapRef.current;
    const Tmapv2 = window.Tmapv2;

    try {
      // Clear existing overlays
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];

      // Draw Path (Polyline)
      if (result.path && result.path.length > 0) {
        const pathCoords = result.path
            .map(p => {
                const lat = Number(p.lat);
                const lng = Number(p.lng);
                if (isNaN(lat) || isNaN(lng)) return null;
                return new Tmapv2.LatLng(lat, lng);
            })
            .filter(p => p !== null);

        if (pathCoords.length > 0) {
            polylineRef.current = new Tmapv2.Polyline({
              path: pathCoords,
              strokeColor: "#2563eb",
              strokeWeight: 6,
              strokeOpacity: 0.8,
              direction: true,
              map: map
            });
        }
      }

      // Draw Markers
      const bounds = new Tmapv2.LatLngBounds();
      let hasValidPoints = false;

      result.stops.forEach((stop) => {
        const lat = parseFloat(stop.lat);
        const lng = parseFloat(stop.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const pos = new Tmapv2.LatLng(lat, lng);
        bounds.extend(pos);
        hasValidPoints = true;

        const marker = new Tmapv2.Marker({
          position: pos,
          icon: createMarkerIcon(stop.type, stop.sequence),
          iconSize: new Tmapv2.Size(36, 48),
          offset: new Tmapv2.Point(18, 48),
          map: map,
          label: `<span style="background:white; border:1px solid #ddd; padding:2px 5px; border-radius:3px; font-size:11px; font-weight:bold; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">${stop.name}</span>`
        });
        markersRef.current.push(marker);
      });

      if (hasValidPoints) {
        // Delay fitBounds slightly to ensure map size is calculated
        requestAnimationFrame(() => {
            try {
                map.fitBounds(bounds);
            } catch(e) { console.error("fitBounds error", e); }
        });
      }
    } catch (e) {
      console.error("Error drawing on map:", e);
    }
  }, [result, isLibLoaded]); // Re-run when result changes

  return (
    <div className="w-full h-[450px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative z-0">
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/90 z-20 p-6 text-center backdrop-blur-sm">
          <div>
            <p className="text-red-500 font-bold mb-2">지도를 불러올 수 없습니다</p>
            <p className="text-xs text-gray-500 bg-white px-3 py-2 rounded border border-red-100">{mapError}</p>
          </div>
        </div>
      )}
      {!isLibLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="flex flex-col items-center gap-3">
             <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
             <p className="text-sm text-gray-400 font-medium">지도를 준비 중입니다...</p>
          </div>
        </div>
      )}
      {/* Pass the unique ID, though we use ref for initialization */}
      <div id={mapIdRef.current} ref={mapRef} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;