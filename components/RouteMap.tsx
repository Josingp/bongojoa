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
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const mapInstance = useRef<any>(null);

  // 1. Script Loading Strategy (Polling)
  // This is more robust than 'onload' events in React because it handles cases
  // where the script is already in the DOM but the event was missed.
  useEffect(() => {
    // Immediate check
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsScriptLoaded(true);
      return;
    }

    const scriptId = "tmap_jssdk_v2";
    let script = document.getElementById(scriptId);

    // Inject Script if missing
    if (!script) {
      const cleanKey = apiKey ? apiKey.replace(/["'\s]/g, "") : "";
      script = document.createElement("script");
      script.id = scriptId;
      script.setAttribute("src", `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${cleanKey}`);
      script.setAttribute("async", "true");
      document.head.appendChild(script);
    }

    // Polling interval to check for window.Tmapv2
    const intervalId = setInterval(() => {
      if (window.Tmapv2 && window.Tmapv2.Map) {
        setIsScriptLoaded(true);
        clearInterval(intervalId);
      }
    }, 200); // Check every 200ms

    // Stop checking after 15 seconds to prevent infinite loops
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
    }, 15000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [apiKey]);


  // 2. Map Rendering
  useEffect(() => {
    // Only proceed if script is loaded AND we have a result
    if (!isScriptLoaded || !result || !window.Tmapv2) return;

    const container = document.getElementById(mapContainerId);
    if (!container) return;

    // Clean up previous map instance safely
    container.innerHTML = "";
    mapInstance.current = null;

    try {
      const startNode = result.stops[0];
      const startLat = Number(startNode?.lat) || 37.554678;
      const startLng = Number(startNode?.lng) || 126.970606;

      // Initialize Map
      const map = new window.Tmapv2.Map(mapContainerId, {
        center: new window.Tmapv2.LatLng(startLat, startLng),
        width: "100%",
        height: "100%",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true,
        httpsMode: true // Required for Vercel/HTTPS
      });
      mapInstance.current = map;

      // 1. Draw Polyline (Path)
      if (result.path && result.path.length > 0) {
        const pathCoords = result.path.map(p => 
          new window.Tmapv2.LatLng(p.lat, p.lng)
        );

        new window.Tmapv2.Polyline({
          path: pathCoords,
          strokeColor: "#2563eb", // Blue-600
          strokeWeight: 6,
          strokeOpacity: 0.8,
          direction: true,
          map: map
        });
      }

      // 2. Draw Markers
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

      // 3. Fit Bounds (Auto-zoom)
      if (hasPoints) {
        // Slight delay ensures the map is fully rendered before fitting bounds
        setTimeout(() => map.fitBounds(bounds), 100);
      }

    } catch (error) {
      console.error("Map initialization error:", error);
    }
  }, [isScriptLoaded, result]); // Re-run when script loads or result updates


  // Helper: Create SVG Icon
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
      {/* Loading Spinner */}
      {!isScriptLoaded && (
        <div className="absolute inset-0 bg-white z-10 flex flex-col items-center justify-center">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
           <p className="text-gray-400 text-sm">지도 로딩 중...</p>
        </div>
      )}
      <div id={mapContainerId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;