import React, { useEffect, useRef, useState } from 'react';
import { OptimizationResult } from '../types';

interface RouteMapProps {
  result: OptimizationResult | null;
  apiKey: string;
  center?: { lat: string; lng: string };
}

declare global {
  interface Window {
    Tmapv2: any;
  }
}

const RouteMap: React.FC<RouteMapProps> = ({ result, apiKey, center }) => {
  const mapId = "tmap_map_area";
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);

  // 1. Load TMAP Script once
  useEffect(() => {
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsScriptLoaded(true);
      return;
    }

    const scriptId = 'tmap_v2_script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      // Remove any quotes or spaces from key just in case
      const cleanKey = apiKey ? apiKey.replace(/["'\s]/g, "") : "";
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${cleanKey}`;
      script.async = true;
      script.onload = () => setIsScriptLoaded(true);
      document.head.appendChild(script);
    } else {
      // If script exists but is not ready, poll for it
      const interval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map) {
          setIsScriptLoaded(true);
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [apiKey]);

  // 2. Initialize Map Instance (Only Once)
  useEffect(() => {
    if (!isScriptLoaded || !window.Tmapv2 || mapInstance.current) return;

    const container = document.getElementById(mapId);
    if (!container) return;

    // Use provided center or default to Seoul
    const initialLat = center?.lat ? Number(center.lat) : 37.5665;
    const initialLng = center?.lng ? Number(center.lng) : 126.9780;

    try {
      mapInstance.current = new window.Tmapv2.Map(mapId, {
        center: new window.Tmapv2.LatLng(initialLat, initialLng),
        width: "100%",
        height: "100%",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true,
        httpsMode: true // Essential for Vercel/HTTPS environments
      });
    } catch (e) {
      console.error("Failed to initialize TMAP:", e);
    }
  }, [isScriptLoaded]);

  // 3. Update Map (Markers & Paths) when result or center changes
  useEffect(() => {
    if (!mapInstance.current || !window.Tmapv2) return;
    
    const map = mapInstance.current;

    // Clear existing overlays
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    // If no result, just update center if it changed significantly
    if (!result) {
      if (center?.lat && center?.lng) {
        const newCenter = new window.Tmapv2.LatLng(Number(center.lat), Number(center.lng));
        map.setCenter(newCenter);
      }
      return;
    }

    // --- Draw New Data ---
    const bounds = new window.Tmapv2.LatLngBounds();
    let hasPoints = false;

    // 1. Draw Polyline
    if (result.path && result.path.length > 0) {
      const pathCoords = result.path.map(p => new window.Tmapv2.LatLng(p.lat, p.lng));
      const polyline = new window.Tmapv2.Polyline({
        path: pathCoords,
        strokeColor: "#2563eb", // Blue-600
        strokeWeight: 6,
        strokeOpacity: 0.8,
        direction: true,
        map: map
      });
      polylinesRef.current.push(polyline);
    }

    // 2. Draw Markers
    result.stops.forEach((stop) => {
      const lat = Number(stop.lat);
      const lng = Number(stop.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        const point = new window.Tmapv2.LatLng(lat, lng);
        bounds.extend(point);
        hasPoints = true;

        const marker = new window.Tmapv2.Marker({
          position: point,
          icon: createMarkerIcon(stop.type, stop.sequence),
          iconSize: new window.Tmapv2.Size(38, 50),
          offset: new window.Tmapv2.Point(19, 50),
          map: map,
          title: stop.name
        });
        markersRef.current.push(marker);
      }
    });

    // 3. Fit Bounds
    if (hasPoints) {
      // Add a small delay to ensure rendering is ready before fitting bounds
      setTimeout(() => map.fitBounds(bounds), 100);
    }

  }, [result, center, isScriptLoaded]); // Re-run when result or center input changes

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
    <div className="w-full h-[600px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative z-0">
      <div id={mapId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;