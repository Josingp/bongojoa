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

// Global variable to ensure script is requested only once per session
let tmapScriptPromise: Promise<void> | null = null;

const RouteMap: React.FC<RouteMapProps> = ({ result, apiKey }) => {
  const mapContainerId = "tmap_layer_div";
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState("");
  const mapInstance = useRef<any>(null);

  // --------------------------------------------------------------------------
  // 1. Script Loading Logic (Singleton Pattern)
  // --------------------------------------------------------------------------
  const loadTmapScript = (key: string): Promise<void> => {
    // If TMAP is already fully loaded, resolve immediately
    if (window.Tmapv2 && window.Tmapv2.Map && window.Tmapv2.LatLng) {
      return Promise.resolve();
    }

    // Return existing promise if loading is in progress
    if (tmapScriptPromise) {
      return tmapScriptPromise;
    }

    // Create new loading promise
    tmapScriptPromise = new Promise((resolve, reject) => {
      const scriptId = 'tmap_jssdk_v2';
      
      // If script tag exists but TMAP not ready (rare edge case), wait for it
      if (document.getElementById(scriptId)) {
        const checkInterval = setInterval(() => {
          if (window.Tmapv2 && window.Tmapv2.Map) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!window.Tmapv2) reject(new Error("Timeout waiting for existing script initialization."));
        }, 10000);
        return;
      }

      // Inject Script
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${key}`;
      script.async = true;
      
      script.onload = () => {
        // Script loaded, wait for Tmapv2 object to be constructed
        const checkInterval = setInterval(() => {
          if (window.Tmapv2 && window.Tmapv2.Map) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
        
        // Safety timeout after load
        setTimeout(() => {
          clearInterval(checkInterval);
          // Try resolving anyway, sometimes it works even if check fails momentarily
          resolve(); 
        }, 3000);
      };

      script.onerror = () => {
        tmapScriptPromise = null; // Reset to allow retry
        reject(new Error("Failed to load TMAP SDK script. Check your network or API Key."));
      };

      document.head.appendChild(script);
    });

    return tmapScriptPromise;
  };

  useEffect(() => {
    if (!apiKey) {
      setLoadingState('error');
      setErrorMessage("API Key is missing.");
      return;
    }

    setLoadingState('loading');
    
    loadTmapScript(apiKey)
      .then(() => {
        setLoadingState('success');
      })
      .catch((err) => {
        console.error("TMAP Init Error:", err);
        setLoadingState('error');
        setErrorMessage(err.message || "지도 로드 중 오류가 발생했습니다.");
        tmapScriptPromise = null; // Clear promise to allow manual retry
      });
  }, [apiKey]);

  // --------------------------------------------------------------------------
  // 2. Map Drawing Logic
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (loadingState !== 'success' || !result) return;
    
    const container = document.getElementById(mapContainerId);
    if (!container) return;

    // Reset Container
    container.innerHTML = "";
    if (mapInstance.current) mapInstance.current = null;

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

      // Draw Route Polyline
      if (result.path && result.path.length > 0) {
        const pathCoords = result.path.map(p => 
          new window.Tmapv2.LatLng(p.lat, p.lng)
        );

        new window.Tmapv2.Polyline({
          path: pathCoords,
          strokeColor: "#2563eb", // Primary Blue
          strokeWeight: 6,
          strokeOpacity: 0.85,
          direction: true,
          map: map
        });
      }

      // Draw Markers & Calculate Bounds
      const bounds = new window.Tmapv2.LatLngBounds();
      let hasPoints = false;

      result.stops.forEach((stop) => {
        const lat = Number(stop.lat);
        const lng = Number(stop.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const position = new window.Tmapv2.LatLng(lat, lng);
        bounds.extend(position);
        hasPoints = true;

        new window.Tmapv2.Marker({
          position: position,
          icon: createMarkerIcon(stop.type, stop.sequence),
          iconSize: new window.Tmapv2.Size(50, 64),
          offset: new window.Tmapv2.Point(25, 64),
          map: map,
          title: stop.name
        });
      });

      // Fit Bounds
      if (hasPoints) {
        // Slight delay to ensure DOM is ready
        setTimeout(() => {
           if (map.resize) map.resize();
           map.fitBounds(bounds, 60);
        }, 200);
      }

    } catch (e) {
      console.error("Map Drawing Failed:", e);
      setLoadingState('error');
      setErrorMessage("지도 렌더링에 실패했습니다. 페이지를 새로고침 해주세요.");
    }

  }, [loadingState, result]);

  // --------------------------------------------------------------------------
  // 3. Helper: Custom SVG Markers
  // --------------------------------------------------------------------------
  const createMarkerIcon = (type: 'Start' | 'End' | 'Via', sequence?: number) => {
    let color = '#3b82f6'; // Blue (Via)
    let label = sequence ? String(sequence) : '';
    let iconChar = label;
    
    // Explicit colors for clarity
    if (type === 'Start') {
        color = '#16a34a'; // Green
        iconChar = 'S';
    } else if (type === 'End') {
        color = '#dc2626'; // Red
        iconChar = 'E';
    }

    const svg = `
      <svg width="50" height="64" viewBox="0 0 50 64" xmlns="http://www.w3.org/2000/svg">
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
        <g filter="url(#shadow)">
            <path d="M25 0C11.2 0 0 11.2 0 25c0 14 25 39 25 39s25-25 25-39c0-13.8-11.2-25-25-25z" fill="${color}" stroke="white" stroke-width="2.5"/>
            <circle cx="25" cy="25" r="13" fill="white" opacity="0.2"/>
            <text x="25" y="31" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="white" text-anchor="middle">${iconChar}</text>
        </g>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <div className="w-full h-[500px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative z-0">
      
      {/* Loading State */}
      {loadingState === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10 space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-medium animate-pulse">지도 로드 중...</p>
        </div>
      )}

      {/* Error State */}
      {loadingState === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-20 p-6 text-center">
          <div className="text-red-500 font-bold text-lg mb-2">⚠ 지도 로드 실패</div>
          <p className="text-gray-600 text-sm mb-4">{errorMessage}</p>
          <button 
            onClick={() => {
              setLoadingState('loading');
              setErrorMessage("");
              tmapScriptPromise = null;
              loadTmapScript(apiKey).then(() => setLoadingState('success')).catch((e) => {
                setLoadingState('error');
                setErrorMessage(e.message);
              });
            }}
            className="px-4 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-sm font-medium"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Map Container */}
      <div id={mapContainerId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;