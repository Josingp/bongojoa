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
  
  if (type === 'Start') {
    color = '#16a34a'; // Green
    text = 'S';
  } else if (type === 'End') {
    color = '#dc2626'; // Red
    text = 'E';
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
      <path fill="${color}" d="M16 0C7.16 0 0 7.16 0 16c0 10 16 26 16 26s16-16 16-26c0-8.84-7.16-16-16-16z" stroke="white" stroke-width="1.5"/>
      <circle cx="16" cy="16" r="10" fill="white" />
      <text x="16" y="21" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${color}" text-anchor="middle">${text}</text>
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

      // Create Marker
      const marker = new Tmapv2.Marker({
        position: position,
        icon: iconUrl,
        iconSize: new Tmapv2.Size(32, 42),
        offset: new Tmapv2.Point(16, 42), // Anchor Point: Bottom Center
        map: map,
        title: stop.name
      });
      
      markersRef.current.push(marker);
    });

    // 4. Fit Bounds
    if (hasPoints) {
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