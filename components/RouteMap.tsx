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

const RouteMap: React.FC<RouteMapProps> = ({ result, apiKey }) => {
  // Use a stable, unique ID for the map container
  const mapId = useRef(`tmap_container_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tmapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  
  const [isLibLoaded, setIsLibLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Helper to check if TMAP is fully loaded
  const isTmapReady = () => {
    return (
      window.Tmapv2 && 
      typeof window.Tmapv2.Map === 'function' && 
      typeof window.Tmapv2.LatLng === 'function'
    );
  };

  // 1. Script Loading Logic
  useEffect(() => {
    if (!apiKey) {
      setMapError("TMAP API Key가 설정되지 않았습니다.");
      return;
    }

    // Check if TMAP is already available and fully loaded
    if (isTmapReady()) {
      setIsLibLoaded(true);
      return;
    }

    const scriptId = 'tmap-jssdk';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
      script.async = true;
      
      script.onload = () => {
        // Even after onload, internal modules might need a moment
        if (isTmapReady()) {
          setIsLibLoaded(true);
        } else {
            // Poll for a short time
            const loadCheckInterval = setInterval(() => {
                if (isTmapReady()) {
                    clearInterval(loadCheckInterval);
                    setIsLibLoaded(true);
                }
            }, 100);
            
            // Timeout safety
            setTimeout(() => clearInterval(loadCheckInterval), 3000);
        }
      };

      script.onerror = () => {
        setMapError("TMAP 스크립트 로드 실패. API Key나 도메인 설정을 확인해주세요.");
      };

      document.head.appendChild(script);
    } else {
        // Script exists, check if loaded or wait
        if (isTmapReady()) {
            setIsLibLoaded(true);
        } else {
            const interval = setInterval(() => {
                if (isTmapReady()) {
                    clearInterval(interval);
                    setIsLibLoaded(true);
                }
            }, 200);
            
            // Timeout after 5s
            setTimeout(() => {
                clearInterval(interval);
                if (!isTmapReady()) {
                    setMapError("TMAP 라이브러리 초기화 실패: 네트워크 상태나 API 키를 확인해주세요.");
                }
            }, 5000);
        }
    }
  }, [apiKey]);

  // 2. Map Initialization & Drawing
  useEffect(() => {
    // Requirements: Lib loaded (strictly checked), Result exists
    if (!isLibLoaded || !result) return;
    
    // Ensure the DIV exists in DOM before init
    const mapContainer = document.getElementById(mapId.current);
    if (!mapContainer) return;

    // Cleanup previous map instance
    if (tmapRef.current) {
       mapContainer.innerHTML = ""; 
       tmapRef.current = null;
    }

    try {
        const startNode = result.stops[0];
        const lat = parseFloat(startNode?.lat) || 37.5665;
        const lng = parseFloat(startNode?.lng) || 126.9780;

        // Double check constructor existence before calling
        if (typeof window.Tmapv2.LatLng !== 'function') {
            throw new Error("TMAP 핵심 모듈(LatLng)이 로드되지 않았습니다.");
        }

        // Initialize Map
        const map = new window.Tmapv2.Map(mapId.current, {
          center: new window.Tmapv2.LatLng(lat, lng),
          width: "100%",
          height: "100%",
          zoom: 14,
          zoomControl: true,
          scrollwheel: true
        });

        tmapRef.current = map;

        // Draw Route Elements
        drawRouteFeatures(map);

    } catch (e: any) {
        console.error("Map Init Error:", e);
        setMapError(`지도 생성 오류: ${e?.message || "알 수 없는 오류"}`);
    }

    return () => {
        if (tmapRef.current) {
            tmapRef.current = null;
        }
        const container = document.getElementById(mapId.current);
        if (container) container.innerHTML = "";
    };
  }, [isLibLoaded, result]); 

  const drawRouteFeatures = (map: any) => {
    try {
        // 1. Polyline
        if (result.path && result.path.length > 0) {
            const pathCoords = result.path.map(p => 
                new window.Tmapv2.LatLng(p.lat, p.lng)
            );

            polylineRef.current = new window.Tmapv2.Polyline({
                path: pathCoords,
                strokeColor: "#2563eb",
                strokeWeight: 6,
                strokeOpacity: 0.8,
                direction: true,
                map: map
            });
        }

        // 2. Markers
        const bounds = new window.Tmapv2.LatLngBounds();
        let hasPoints = false;

        result.stops.forEach((stop) => {
            const lat = parseFloat(stop.lat);
            const lng = parseFloat(stop.lng);
            if (isNaN(lat) || isNaN(lng)) return;

            const position = new window.Tmapv2.LatLng(lat, lng);
            bounds.extend(position);
            hasPoints = true;

            const marker = new window.Tmapv2.Marker({
                position: position,
                icon: createMarkerIcon(stop.type, stop.sequence),
                iconSize: new window.Tmapv2.Size(36, 48),
                offset: new window.Tmapv2.Point(18, 48),
                map: map,
                title: stop.name
            });
            markersRef.current.push(marker);
        });

        // 3. Fit Bounds
        if (hasPoints) {
            setTimeout(() => {
                try {
                   map.fitBounds(bounds);
                } catch(e) { console.error("Bounds Error", e); }
            }, 100);
        }

    } catch (drawError) {
        console.error("Drawing Error:", drawError);
    }
  };

  const createMarkerIcon = (type: 'Start' | 'End' | 'Via', sequence?: number) => {
    let color = '#2563eb';
    let text = sequence?.toString() || '';
    
    if (type === 'Start') { color = '#16a34a'; text = 'S'; }
    else if (type === 'End') { color = '#dc2626'; text = 'E'; }
  
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
        <defs>
          <filter id="shadow" x="-50%" y="-20%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="0" dy="2" result="offsetblur"/>
            <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <path fill="${color}" d="M18 0C8.06 0 0 8.06 0 18c0 11 18 30 18 30s18-19 18-30c0-9.94-8.06-18-18-18z" filter="url(#shadow)" stroke="white" stroke-width="1.5"/>
        <circle cx="18" cy="18" r="10" fill="white" opacity="0.9"/>
        <text x="18" y="23" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="${color}" text-anchor="middle">${text}</text>
      </svg>
    `.trim();
  
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <div className="w-full h-[450px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative z-0">
      {mapError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/95 z-20 p-6 text-center">
          <p className="text-red-500 font-bold mb-2">지도를 불러올 수 없습니다</p>
          <p className="text-xs text-gray-600 bg-white px-3 py-2 rounded border border-red-100 shadow-sm max-w-[90%] break-words">
            {mapError}
          </p>
          {mapError.includes("API 키") && (
             <p className="mt-2 text-[10px] text-gray-400">Vercel 환경 변수(VITE_TMAP_APP_KEY)를 확인하세요.</p>
          )}
        </div>
      )}
      
      {!isLibLoaded && !mapError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10 gap-3">
           <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
           <p className="text-sm text-gray-400 font-medium">지도 로딩 중...</p>
        </div>
      )}

      <div id={mapId.current} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;