import React, { useEffect, useState } from 'react';
import { OptimizationResult } from '../types';

interface RouteMapProps {
  result: OptimizationResult; // Result is now mandatory because we only render this component when result exists
  apiKey: string;
}

declare global {
  interface Window {
    Tmapv2: any;
  }
}

const RouteMap: React.FC<RouteMapProps> = ({ result, apiKey }) => {
  const mapId = "tmap_map_area";
  const [isReady, setIsReady] = useState(false);

  // 1. Script Loading & Check
  useEffect(() => {
    // If Tmapv2 is already available globally, we are ready immediately
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsReady(true);
      return;
    }

    const scriptId = 'tmap_v2_script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      const cleanKey = apiKey ? apiKey.replace(/["'\s]/g, "") : "";
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${cleanKey}`;
      script.async = true;
      script.onload = () => setIsReady(true);
      document.head.appendChild(script);
    } else {
      // Script tag exists but window.Tmapv2 might not be ready. Wait for it.
      const timer = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map) {
          setIsReady(true);
          clearInterval(timer);
        }
      }, 100);
      return () => clearInterval(timer);
    }
  }, [apiKey]);

  // 2. Map Rendering
  useEffect(() => {
    if (!isReady || !result) return;

    // Use a slight delay to ensure the DOM div is fully painted
    const initTimer = setTimeout(() => {
      const container = document.getElementById(mapId);
      if (!container) return;

      // Clean up previous map if any (though usually this component is fresh)
      container.innerHTML = "";

      try {
        const startNode = result.stops[0];
        const startLat = Number(startNode?.lat) || 37.5665;
        const startLng = Number(startNode?.lng) || 126.9780;

        // Initialize Map
        const map = new window.Tmapv2.Map(mapId, {
          center: new window.Tmapv2.LatLng(startLat, startLng),
          width: "100%",
          height: "100%",
          zoom: 14,
          zoomControl: true,
          scrollwheel: true,
          httpsMode: true
        });

        // Draw Path (Polyline)
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

        // Auto-fit bounds to show all points
        if (hasPoints) {
           map.fitBounds(bounds);
        }

      } catch (error) {
        console.error("Error initializing TMAP:", error);
      }
    }, 100); // 100ms delay to ensure container is ready

    return () => clearTimeout(initTimer);
  }, [isReady, result]);

  // SVG Marker Icon Generator
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
    <div className="w-full h-[600px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative">
      <div id={mapId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;