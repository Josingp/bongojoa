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
  const isMounted = useRef(true);

  // ----------------------------------------------------------------
  // 1. Singleton Script Loading Strategy
  // ----------------------------------------------------------------
  useEffect(() => {
    isMounted.current = true;
    
    // Sanitize Key
    const cleanKey = apiKey ? apiKey.replace(/["'\s]/g, "") : "";
    if (!cleanKey) {
      if(isMounted.current) {
        setStatus('error');
        setDebugMsg("API Key가 없습니다.");
      }
      return;
    }

    // A. Already loaded?
    if (window.Tmapv2 && window.Tmapv2.Map) {
      if(isMounted.current) setStatus('success');
      return;
    }

    if(isMounted.current) setStatus('loading');

    const scriptId = 'tmap_jssdk_v2';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    // B. If script doesn't exist, create it.
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${cleanKey}`;
      script.async = true;
      document.head.appendChild(script);
    }

    // C. Wait for initialization (Polling)
    // We poll instead of relying solely on onload because Tmapv2 might take a moment to construct after script exec.
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      // Success Check
      if (window.Tmapv2 && window.Tmapv2.Map) {
        clearInterval(checkInterval);
        if(isMounted.current) setStatus('success');
        return;
      }

      // Timeout Check (10 seconds)
      if (Date.now() - startTime > 10000) {
        clearInterval(checkInterval);
        if(isMounted.current) {
          setStatus('error');
          // If REST APIs work but Map doesn't, it's almost always Domain restrictions or Script URL formatting.
          setDebugMsg("시간 초과: TMAP SDK가 응답하지 않습니다. (도메인 미등록 가능성 높음)");
        }
      }
    }, 200);

    return () => {
      isMounted.current = false;
      clearInterval(checkInterval);
    };
  }, [apiKey]);


  // ----------------------------------------------------------------
  // 2. Map Rendering Logic
  // ----------------------------------------------------------------
  useEffect(() => {
    if (status !== 'success' || !result || !window.Tmapv2) return;

    const container = document.getElementById(mapContainerId);
    if (!container) return;

    // Clear previous map instance if it exists
    if (mapInstance.current) {
       // TMAP v2 doesn't have a clean destroy method documented consistently, 
       // so we clear the innerHTML and nullify the reference.
       // However, reusing the div often works better if we just clear it.
       container.innerHTML = "";
       mapInstance.current = null;
    }

    try {
      const startNode = result.stops[0];
      const startLat = Number(startNode?.lat) || 37.5665;
      const startLng = Number(startNode?.lng) || 126.9780;

      const map = new window.Tmapv2.Map(mapContainerId, {
        center: new window.Tmapv2.LatLng(startLat, startLng),
        width: "100%",
        height: "100%",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true
      });
      mapInstance.current = map;

      // Draw Path
      if (result.path && result.path.length > 0) {
        const pathCoords = result.path.map(p => new window.Tmapv2.LatLng(p.lat, p.lng));
        new window.Tmapv2.Polyline({
          path: pathCoords,
          strokeColor: "#2563eb", // Blue-600
          strokeWeight: 6,
          strokeOpacity: 0.8,
          direction: true,
          map: map
        });
      }

      // Draw Markers & Fit Bounds
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
        setTimeout(() => map.fitBounds(bounds, 60), 100);
      }

    } catch (e: any) {
      console.error("Map Render Error:", e);
      setStatus('error');
      setDebugMsg(`지도 생성 중 오류 발생: ${e.message}`);
    }
  }, [status, result]); // Re-run when status becomes success or result changes

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
          <p className="text-gray-500 font-medium text-sm">지도를 불러오는 중...</p>
        </div>
      )}

      {/* Error Overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 bg-gray-50 z-20 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-3">
             <span className="text-2xl font-bold">!</span>
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">지도를 로드할 수 없습니다</h3>
          <p className="text-sm text-gray-600 mb-4 max-w-xs break-keep">
            다른 기능은 작동하지만 지도가 보이지 않는다면, <strong>TMAP 웹 도메인 설정</strong> 문제일 가능성이 99%입니다.
          </p>
          
          <div className="bg-white p-3 rounded border border-gray-200 text-left text-xs text-gray-500 w-full max-w-sm mb-4">
             <p className="mb-1"><strong>Error Detail:</strong> {debugMsg}</p>
             <p className="mb-1"><strong>Environment:</strong> {window.location.hostname}</p>
             <p className="truncate"><strong>Used Key:</strong> {apiKey ? apiKey.substring(0, 10) + '...' : 'Empty'}</p>
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-700 transition-colors"
          >
            새로고침
          </button>
        </div>
      )}

      <div id={mapContainerId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;