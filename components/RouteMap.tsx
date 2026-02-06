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

// Global flag to prevent duplicate script injection across re-renders
let isScriptInjectionStarted = false;

const RouteMap: React.FC<RouteMapProps> = ({ result, apiKey }) => {
  const mapContainerId = "tmap_container_main";
  const mapInstance = useRef<any>(null);
  const [isSdkReady, setIsSdkReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // 1. TMAP SDK Loading Logic (Global Singleton Pattern)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!apiKey) {
      setErrorMessage("API Key가 누락되었습니다.");
      return;
    }

    // 1-1. Check if already loaded and ready
    if (isTmapModulesReady()) {
      setIsSdkReady(true);
      return;
    }

    // 1-2. Inject Script if not started yet
    if (!isScriptInjectionStarted && !document.getElementById('tmap_jssdk')) {
      isScriptInjectionStarted = true;
      const script = document.createElement('script');
      script.id = 'tmap_jssdk';
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
      script.async = true;
      document.head.appendChild(script);
    }

    // 1-3. Polling until 'LatLng' constructor is available
    // TMAP loads the main object first, then modules like Map/LatLng asynchronously.
    const intervalId = setInterval(() => {
      if (isTmapModulesReady()) {
        clearInterval(intervalId);
        setIsSdkReady(true);
      }
    }, 100);

    // Timeout safety (10 seconds)
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      if (!isTmapModulesReady()) {
        setErrorMessage("지도를 불러오는 데 시간이 너무 오래 걸립니다. 새로고침 해주세요.");
      }
    }, 10000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [apiKey]);

  // Helper: Strictly check for Constructors
  const isTmapModulesReady = () => {
    return (
      window.Tmapv2 &&
      typeof window.Tmapv2.Map === 'function' &&
      typeof window.Tmapv2.LatLng === 'function' &&
      typeof window.Tmapv2.Polyline === 'function' &&
      typeof window.Tmapv2.Marker === 'function'
    );
  };

  // --------------------------------------------------------------------------
  // 2. Map Rendering Logic
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Requirements not met yet
    if (!isSdkReady || !result || !document.getElementById(mapContainerId)) return;

    // Safety: Ensure apiKey matches the one used for loading
    // (In React StrictMode, this runs twice. We need to handle cleanup carefully)

    const container = document.getElementById(mapContainerId);
    if (!container) return;

    // CLEAR PREVIOUS MAP: TMap v2 doesn't have a reliable destroy(), so we clear DOM.
    if (mapInstance.current) {
        mapInstance.current = null;
    }
    container.innerHTML = "";

    try {
      const startNode = result.stops[0];
      const initialLat = parseFloat(startNode?.lat) || 37.5665;
      const initialLng = parseFloat(startNode?.lng) || 126.9780;

      // Initialize Map
      const map = new window.Tmapv2.Map(mapContainerId, {
        center: new window.Tmapv2.LatLng(initialLat, initialLng),
        width: "100%",
        height: "100%",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true
      });

      mapInstance.current = map;

      // Draw Route (Polyline)
      if (result.path && result.path.length > 0) {
        const pathCoords = result.path.map(p => 
          new window.Tmapv2.LatLng(p.lat, p.lng)
        );

        new window.Tmapv2.Polyline({
          path: pathCoords,
          strokeColor: "#2563eb", // Blue-600
          strokeWeight: 6,
          strokeOpacity: 0.8,
          direction: true, // Arrows
          map: map
        });
      }

      // Draw Markers
      const bounds = new window.Tmapv2.LatLngBounds();
      let hasPoints = false;

      result.stops.forEach((stop) => {
        const lat = parseFloat(stop.lat);
        const lng = parseFloat(stop.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const position = new window.Tmapv2.LatLng(lat, lng);
        bounds.extend(position);
        hasPoints = true;

        // Custom HTML Marker Icon
        const marker = new window.Tmapv2.Marker({
          position: position,
          icon: createCustomMarker(stop.type, stop.sequence),
          iconSize: new window.Tmapv2.Size(42, 54), // Slightly larger
          offset: new window.Tmapv2.Point(21, 54),  // Bottom center anchor
          map: map,
          title: stop.name
        });
      });

      // Fit Bounds (Auto-zoom)
      if (hasPoints) {
        // Delay to ensure DOM rendering of the map div is complete
        setTimeout(() => {
           // TMAP sometimes needs a resize trigger if div size changed
           if(map.resize) map.resize(); 
           
           // Apply bounds with margin
           map.fitBounds(bounds, 50); // 50px margin
        }, 200);
      }

    } catch (e: any) {
      console.error("Map Draw Error:", e);
      setErrorMessage(`지도 생성 중 오류: ${e.message}`);
    }

  }, [isSdkReady, result]); // Re-run when SDK is ready or Data changes

  // --------------------------------------------------------------------------
  // Helper: SVG Marker Generator
  // --------------------------------------------------------------------------
  const createCustomMarker = (type: 'Start' | 'End' | 'Via', sequence?: number) => {
    let color = '#2563eb'; // Default Blue
    let label = sequence?.toString() || '';
    let iconChar = label;

    if (type === 'Start') {
        color = '#16a34a'; // Green
        iconChar = 'S';
    } else if (type === 'End') {
        color = '#dc2626'; // Red
        iconChar = 'E';
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="42" height="54" viewBox="0 0 42 54">
        <defs>
          <filter id="f1" x="-50%" y="-20%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5"/>
            <feOffset dx="0" dy="3" result="offsetblur"/>
            <feComponentTransfer>
                <feFuncA type="linear" slope="0.4"/>
            </feComponentTransfer>
            <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#f1)">
            <path fill="${color}" d="M21 0C9.4 0 0 9.4 0 21c0 12.8 21 33 21 33s21-20.2 21-33c0-11.6-9.4-21-21-21z" stroke="white" stroke-width="2.5"/>
            <circle cx="21" cy="21" r="11" fill="white" opacity="0.95"/>
            <text x="21" y="27" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="${color}" text-anchor="middle">${iconChar}</text>
        </g>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <div className="w-full h-[500px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative z-0">
      
      {/* Loading State */}
      {!isSdkReady && !errorMessage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10 gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-medium animate-pulse">지도 리소스를 불러오는 중...</p>
        </div>
      )}

      {/* Error State */}
      {errorMessage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-20 text-center p-6">
          <div className="text-red-500 font-bold text-lg mb-2">⚠ 지도 로드 실패</div>
          <p className="text-gray-600 text-sm mb-4">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-sm"
          >
            페이지 새로고침
          </button>
        </div>
      )}

      {/* Map Container - ID is fixed */}
      <div id={mapContainerId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;