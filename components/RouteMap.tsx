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
  const mapId = "tmap_map_area";
  const mapRef = useRef<any>(null);
  const isMounted = useRef(false);

  // 1. Script Loading & Initialization
  useEffect(() => {
    isMounted.current = true;
    
    const loadScriptAndInit = () => {
      // If script is already loaded
      if (window.Tmapv2 && window.Tmapv2.Map) {
        initMap();
        return;
      }

      // Check if script tag exists but not loaded yet
      const scriptId = 'tmap_v2_script';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        // Clean API key just in case
        const cleanKey = apiKey ? apiKey.replace(/["'\s]/g, "") : "";
        script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${cleanKey}`;
        script.async = true;
        script.onload = () => {
          if (isMounted.current) initMap();
        };
        script.onerror = () => console.error("TMAP Script failed to load");
        document.head.appendChild(script);
      } else {
        // Poll for existing script to be ready
        const checkInterval = setInterval(() => {
          if (window.Tmapv2 && window.Tmapv2.Map) {
            clearInterval(checkInterval);
            if (isMounted.current) initMap();
          }
        }, 100);
      }
    };

    loadScriptAndInit();

    return () => {
      isMounted.current = false;
      // Cleanup map ref on unmount
      mapRef.current = null;
    };
  }, [apiKey, result]); // Re-init if result changes (new route found)

  const initMap = () => {
    const container = document.getElementById(mapId);
    if (!container) return;

    // CRITICAL: Clear any existing map HTML to prevent duplication/collisions
    container.innerHTML = "";
    mapRef.current = null;

    try {
      const startNode = result.stops[0];
      const startLat = Number(startNode?.lat) || 37.5665;
      const startLng = Number(startNode?.lng) || 126.9780;

      // Create Map Instance
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

      // Draw Path (Polyline)
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

      // Fit Bounds to show all points
      if (hasPoints) {
        // Small delay ensures the map has rendered its size before fitting bounds
        setTimeout(() => {
          map.fitBounds(bounds);
        }, 100);
      }

    } catch (e) {
      console.error("Map Initialization Error:", e);
    }
  };

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
    <div className="w-full h-[600px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative">
      {/* Explicit minHeight prevents 0-height issues during loading */}
      <div id={mapId} className="w-full h-full" style={{ minHeight: '600px' }} />
    </div>
  );
};

export default RouteMap;