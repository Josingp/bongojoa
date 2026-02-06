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

  // 1. Script Loading (Simple & Robust)
  useEffect(() => {
    const scriptId = "tmap_js_api";
    
    // Clean key just in case
    const cleanKey = apiKey ? apiKey.replace(/["'\s]/g, "") : "";

    // If TMAP is already available globally, we are good
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsScriptLoaded(true);
      return;
    }

    // Check if script tag already exists
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${cleanKey}`;
      script.async = true;
      document.head.appendChild(script);
    }

    const handleLoad = () => setIsScriptLoaded(true);
    
    // Attach load listener
    script.addEventListener("load", handleLoad);

    // Cleanup listener prevents memory leaks, but we keep the script in head
    return () => {
      script.removeEventListener("load", handleLoad);
    };
  }, [apiKey]);


  // 2. Initialize Map (Runs when script is loaded & result changes)
  useEffect(() => {
    if (!isScriptLoaded || !result || !window.Tmapv2) return;

    const container = document.getElementById(mapContainerId);
    if (!container) return;

    // Reset container safely
    container.innerHTML = "";
    mapInstance.current = null;

    try {
      const startNode = result.stops[0];
      // Default to Seoul Station if coords missing
      const startLat = Number(startNode?.lat) || 37.554678;
      const startLng = Number(startNode?.lng) || 126.970606;

      // Initialize Map per user example
      const map = new window.Tmapv2.Map(mapContainerId, {
        center: new window.Tmapv2.LatLng(startLat, startLng),
        width: "100%",
        height: "100%",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true,
        httpsMode: true, // Important: User example had this
      });
      mapInstance.current = map;

      // Draw Path (Polyline)
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

      // Fit bounds to show all points
      if (hasPoints) {
        // Small delay to ensure map is rendered
        setTimeout(() => map.fitBounds(bounds), 100);
      }

    } catch (error) {
      console.error("Map initialization failed:", error);
    }
  }, [isScriptLoaded, result]);


  // Helper for Marker SVG
  const createMarkerIcon = (type: string, sequence?: number) => {
    let color = '#3b82f6'; // Blue
    let text = sequence ? String(sequence) : '';
    if (type === 'Start') { color = '#16a34a'; text = 'S'; } // Green
    if (type === 'End') { color = '#dc2626'; text = 'E'; }   // Red

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
      {!isScriptLoaded && (
         <div className="absolute inset-0 bg-white z-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
         </div>
      )}
      <div id={mapContainerId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;