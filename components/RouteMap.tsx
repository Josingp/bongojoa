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
  const mapRef = useRef<HTMLDivElement>(null);
  const tmapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  
  const [isLibLoaded, setIsLibLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // 1. TMAP Script Loading Logic
  useEffect(() => {
    // API Key Check
    if (!apiKey) {
      setMapError("TMAP API Key가 설정되지 않았습니다.");
      return;
    }

    // If TMAP is already loaded globally
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsLibLoaded(true);
      return;
    }

    // Check if script tag already exists
    const scriptId = 'tmap-jssdk';
    const existingScript = document.getElementById(scriptId);

    if (existingScript) {
      // Script exists but Tmapv2 object not ready? Wait for it.
      const checkInterval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map) {
          clearInterval(checkInterval);
          setIsLibLoaded(true);
        }
      }, 500);

      // Safety timeout (10 seconds)
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.Tmapv2) {
           setMapError("지도를 불러오는 데 시간이 너무 오래 걸립니다. 새로고침 해주세요.");
        }
      }, 10000);

      return;
    }

    // Load Script Freshly
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
    script.async = true;

    script.onload = () => {
      // Just in case, double check object existence
      if (window.Tmapv2) {
        setIsLibLoaded(true);
      } else {
        // Fallback polling if onload fired but object not ready (rare)
        const checkInterval = setInterval(() => {
            if (window.Tmapv2) {
                clearInterval(checkInterval);
                setIsLibLoaded(true);
            }
        }, 100);
      }
    };

    script.onerror = () => {
      setMapError("TMAP 스크립트 로드에 실패했습니다. API Key나 도메인 설정을 확인해주세요.");
    };

    document.head.appendChild(script);

    // Cleanup not really possible for script tag, but we can clear error
    return () => setMapError(null);
  }, [apiKey]);


  // 2. Initialize Map & Draw Route
  useEffect(() => {
    if (!isLibLoaded || !mapRef.current || !result) return;

    const initMap = () => {
      try {
        // Ensure container is empty
        if (mapRef.current) {
          mapRef.current.innerHTML = "";
        }

        const startNode = result.stops[0];
        const lat = parseFloat(startNode?.lat) || 37.5665;
        const lng = parseFloat(startNode?.lng) || 126.9780;

        // Create Map Instance
        // Using DOM element directly is supported in V2 and safer for React
        const map = new window.Tmapv2.Map(mapRef.current, {
          center: new window.Tmapv2.LatLng(lat, lng),
          width: "100%",
          height: "100%",
          zoom: 14,
          zoomControl: true,
          scrollwheel: true
        });

        tmapRef.current = map;
        drawRoute(map);
        
      } catch (err: any) {
        console.error("Map Init Error:", err);
        setMapError("지도 생성 중 오류가 발생했습니다.");
      }
    };

    const drawRoute = (map: any) => {
      // Clear previous references just in case (though we cleared innerHTML)
      markersRef.current = [];
      polylineRef.current = null;

      // Draw Polyline
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

      if (hasPoints) {
        // Small delay to ensure container has size
        setTimeout(() => map.fitBounds(bounds), 100);
      }
    };

    // Initialize
    initMap();

    // Cleanup on unmount or result change
    return () => {
      // Clearing innerHTML kills the map instance efficiently
      if (mapRef.current) {
        mapRef.current.innerHTML = "";
      }
      tmapRef.current = null;
    };
  }, [isLibLoaded, result]);


  // Helper for Marker Icons
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
          <p className="text-xs text-gray-500 bg-white px-3 py-2 rounded border border-red-100">{mapError}</p>
        </div>
      )}
      
      {!isLibLoaded && !mapError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10 gap-3">
           <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
           <p className="text-sm text-gray-400 font-medium">지도 로딩 중...</p>
        </div>
      )}

      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;