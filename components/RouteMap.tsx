import React, { useEffect, useRef } from 'react';
import { OptimizationResult } from '../types';

interface RouteMapProps {
  result: OptimizationResult;
}

declare global {
  interface Window {
    Tmapv2: any;
  }
}

// Helper to create SVG Marker Data URI
const createMarkerIcon = (type: 'Start' | 'End' | 'Via', sequence?: number) => {
  let color = '#2563eb'; // Blue for Via
  let text = sequence?.toString() || '';
  let labelBg = 'bg-blue-600';
  
  if (type === 'Start') {
    color = '#16a34a'; // Green
    text = 'S';
    labelBg = 'bg-green-600';
  } else if (type === 'End') {
    color = '#dc2626'; // Red
    text = 'E';
    labelBg = 'bg-red-600';
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
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
      <path fill="${color}" d="M18 0C8.06 0 0 8.06 0 18c0 11 18 30 18 30s18-19 18-30c0-9.94-8.06-18-18-18z" filter="url(#shadow)" stroke="white" stroke-width="1.5"/>
      <circle cx="18" cy="18" r="10" fill="white" opacity="0.9"/>
      <text x="18" y="23" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="${color}" text-anchor="middle">${text}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const RouteMap: React.FC<RouteMapProps> = ({ result }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const tmapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Initialize Map
  useEffect(() => {
    // Check if script is loaded
    if (!window.Tmapv2) {
      console.error("TMap V2 script not loaded");
      return;
    }

    // Initialize map only once
    if (!tmapRef.current && mapRef.current) {
      tmapRef.current = new window.Tmapv2.Map("map_div", {
        center: new window.Tmapv2.LatLng(37.5665, 126.9780), // Seoul City Hall
        width: "100%",
        height: "100%",
        zoom: 13,
        zoomControl: true,
        scrollwheel: true
      });
    }
  }, []);

  // Update Map Data when result changes
  useEffect(() => {
    if (!tmapRef.current || !window.Tmapv2 || !result) return;
    const map = tmapRef.current;
    const Tmapv2 = window.Tmapv2;

    // 1. Clear existing overlays
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    
    if (markersRef.current.length > 0) {
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
    }

    // 2. Draw Polyline (Path)
    if (result.path && result.path.length > 0) {
      const pathCoordinates = result.path.map(
        p => new Tmapv2.LatLng(p.lat, p.lng)
      );

      polylineRef.current = new Tmapv2.Polyline({
        path: pathCoordinates,
        strokeColor: "#2563eb", // Blue line
        strokeWeight: 6,
        strokeOpacity: 0.8,
        direction: true,
        map: map
      });
    }

    // 3. Draw Markers (Stops)
    const bounds = new Tmapv2.LatLngBounds();
    let hasPoints = false;

    // Sort stops to ensure correct processing order
    const sortedStops = [...result.stops].sort((a, b) => a.sequence - b.sequence);

    sortedStops.forEach((stop) => {
      const lat = parseFloat(stop.lat);
      const lng = parseFloat(stop.lng);
      
      if (isNaN(lat) || isNaN(lng)) return;

      const position = new Tmapv2.LatLng(lat, lng);
      bounds.extend(position);
      hasPoints = true;

      // Generate SVG Icon
      const iconUrl = createMarkerIcon(stop.type, stop.sequence);
      
      // Determine label style
      let labelColor = "#2563eb";
      if (stop.type === 'Start') labelColor = "#16a34a";
      if (stop.type === 'End') labelColor = "#dc2626";

      // Create Marker with explicit Label
      const marker = new Tmapv2.Marker({
        position: position,
        icon: iconUrl,
        iconSize: new Tmapv2.Size(36, 48),
        offset: new Tmapv2.Point(18, 48), // Anchor Point: Bottom Center
        map: map,
        title: stop.name, // Tooltip
        label: `<span style="background-color: white; color: ${labelColor}; padding: 4px 8px; border-radius: 4px; border: 1px solid ${labelColor}; font-size: 11px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${stop.name}</span>`
      });
      
      markersRef.current.push(marker);
    });

    // 4. Fit Bounds
    if (hasPoints) {
       // Add a slight delay to ensure map is ready to resize
       setTimeout(() => {
         map.fitBounds(bounds);
       }, 100);
    }

  }, [result]);

  return (
    <div className="w-full h-[500px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-100 relative z-0">
      <div id="map_div" ref={mapRef} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;