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
  const mapContainerId = "tmap_layer_div";
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [debugMsg, setDebugMsg] = useState<string>("");
  const mapInstance = useRef<any>(null);
  const scriptId = 'tmap_jssdk_v2';

  // 1. Script Loading & Initialization
  useEffect(() => {
    // If key is missing
    if (!apiKey) {
      setStatus('error');
      setDebugMsg("API Key가 비어있습니다. 환경변수를 확인해주세요.");
      return;
    }

    // Check if TMAP is already ready
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setStatus('success');
      return;
    }

    setStatus('loading');

    // Remove existing script if it exists but failed to initialize Tmapv2 (Retry logic)
    const existingScript = document.getElementById(scriptId);
    if (existingScript && !window.Tmapv2) {
      existingScript.remove();
    }

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
      script.async = true;

      script.onload = () => {
        // Script loaded successfully, now wait for the global object
        console.log("TMAP Script loaded, waiting for initialization...");
      };

      script.onerror = () => {
        setStatus('error');
        setDebugMsg("TMAP 스크립트 로드 실패 (네트워크 또는 도메인 차단 가능성)");
      };

      document.head.appendChild(script);
    }

    // Polling for window.Tmapv2
    const interval = setInterval(() => {
      if (window.Tmapv2 && window.Tmapv2.Map) {
        clearInterval(interval);
        setStatus('success');
      }
    }, 500);

    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!window.Tmapv2 || !window.Tmapv2.Map) {
        setStatus('error');
        setDebugMsg("시간 초과: TMAP 객체가 생성되지 않았습니다. API Key의 'Web/Javascript' 도메인 설정을 확인해주세요.");
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [apiKey]);

  // 2. Map Rendering
  useEffect(() => {
    if (status !== 'success' || !result) return;

    const container = document.getElementById(mapContainerId);
    if (!container) return;

    // Clear previous map
    container.innerHTML = "";
    mapInstance.current = null;

    try {
      const startNode = result.stops[0];
      const startLat = Number(startNode?.lat) || 37.5665;
      const startLng = Number(startNode?.lng) || 126.9780;

      // Initialize Map
      const map = new window.Tmapv2.Map(mapContainerId, {
        center: new window.Tmapv2.LatLng(startLat, startLng),
        width: "100%",
        height: "100%",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true
      });
      mapInstance.current = map;

      // Draw Route
      if (result.path && result.path.length > 0) {
        const pathCoords = result.path.map(p => 
          new window.Tmapv2.LatLng(p.lat, p.lng)
        );

        new window.Tmapv2.Polyline({
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
        const lat = Number(stop.lat);
        const lng = Number(stop.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          const point = new window.Tmapv2.LatLng(lat, lng);
          bounds.extend(point);
          hasPoints = true;

          new window.Tmapv2.Marker({
            position: point,
            icon: createMarkerIcon(stop.type, stop.sequence),
            iconSize: new window.Tmapv2.Size(38, 50),
            offset: new window.Tmapv2.Point(19, 50),
            map: map,
            title: stop.name
          });
        }
      });

      if (hasPoints) {
        setTimeout(() => map.fitBounds(bounds, 50), 100);
      }

    } catch (e: any) {
      console.error("Map Drawing Error:", e);
      setStatus('error');
      setDebugMsg(`지도 그리기 오류: ${e.message}`);
    }
  }, [status, result]);

  const createMarkerIcon = (type: string, sequence?: number) => {
    let color = '#3b82f6';
    let text = sequence ? String(sequence) : '';
    if (type === 'Start') { color = '#16a34a'; text = 'S'; }
    if (type === 'End') { color = '#dc2626'; text = 'E'; }

    const svg = `
      <svg width="38" height="50" viewBox="0 0 38 50" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 0C8.5 0 0 8.5 0 19c0 10.5 19 31 19 31s19-20.5 19-31c0-10.5-8.5-19-19-19z" fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="19" cy="19" r="10" fill="white" opacity="0.3"/>
        <text x="19" y="24" font-family="sans-serif" font-weight="bold" font-size="14" fill="white" text-anchor="middle">${text}</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <div className="w-full h-[500px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative z-0">
      {/* Loading Overlay */}
      {status === 'loading' && (
        <div className="absolute inset-0 bg-white/90 z-10 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <p className="text-gray-500 font-medium text-sm">지도를 불러오고 있습니다...</p>
        </div>
      )}

      {/* Error Overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 bg-gray-100 z-20 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-red-500 font-bold text-lg mb-2">지도 로드 실패</div>
          <p className="text-gray-600 text-sm mb-4 bg-white p-3 rounded border border-red-100">
            {debugMsg || "알 수 없는 오류가 발생했습니다."}
          </p>
          <div className="text-xs text-gray-400 mb-4">
            Current API Key: {apiKey ? `${apiKey.slice(0, 5)}...${apiKey.slice(-3)}` : 'None'}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-sm"
          >
            페이지 새로고침
          </button>
        </div>
      )}

      <div id={mapContainerId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;