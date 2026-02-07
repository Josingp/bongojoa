import React, { useEffect, useState, useRef } from 'react';
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
  const mapId = "map_div"; 
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const mapRef = useRef<any>(null);

  // 1. Script Loading - mimicking vanilla <script> behavior
  useEffect(() => {
    // If global object exists, we are ready
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setScriptLoaded(true);
      return;
    }

    const scriptId = 'tmap_jssdk';
    const existingScript = document.getElementById(scriptId);

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = scriptId;
      // Clean key just in case
      const cleanKey = apiKey ? apiKey.replace(/["'\s]/g, "") : "";
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${cleanKey}`;
      script.async = true;
      script.onload = () => setScriptLoaded(true);
      script.onerror = () => console.error("TMAP Script failed to load");
      document.head.appendChild(script);
    } else {
      // If script exists but Tmapv2 is not ready yet, wait for it simply
      const checkInterval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map) {
          setScriptLoaded(true);
          clearInterval(checkInterval);
        }
      }, 500);
      return () => clearInterval(checkInterval);
    }
  }, [apiKey]);

  // 2. Map Initialization
  useEffect(() => {
    if (!scriptLoaded || !result || !window.Tmapv2) return;

    const container = document.getElementById(mapId);
    if (!container) return;

    // Reset container to prevent duplicate maps
    container.innerHTML = "";
    
    try {
      const startNode = result.stops[0];
      const startLat = Number(startNode?.lat) || 37.5665;
      const startLng = Number(startNode?.lng) || 126.9780;

      // Initialize map exactly like the vanilla example
      const map = new window.Tmapv2.Map(mapId, {
        center: new window.Tmapv2.LatLng(startLat, startLng),
        width: "100%",
        height: "100%",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true,
        httpsMode: true 
      });
      mapRef.current = map;

      // Draw Path
      if (result.path && result.path.length > 0) {
        const pathCoords = result.path.map(p => new window.Tmapv2.LatLng(p.lat, p.lng));
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
        setTimeout(() => map.fitBounds(bounds), 200);
      }

    } catch (e) {
      console.error("Map Error:", e);
    }
  }, [scriptLoaded, result]);

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
       <div id={mapId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;