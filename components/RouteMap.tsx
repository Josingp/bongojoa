import React, { useEffect, useRef } from 'react';
import { OptimizationResult } from '../types';

interface RouteMapProps {
  result: OptimizationResult;
}

declare global {
  interface Window {
    Tmapv3: any;
  }
}

const RouteMap: React.FC<RouteMapProps> = ({ result }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const tmapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || !window.Tmapv3) return;

    if (!tmapRef.current) {
      // Create Map
      tmapRef.current = new window.Tmapv3.Map(mapRef.current, {
        center: new window.Tmapv3.LatLng(37.5665, 126.9780), // Default Center (Seoul)
        width: "100%",
        height: "100%",
        zoom: 12
      });
    }

    // Cleanup not necessary for singleton ref pattern here in React 18+ strict mode
  }, []);

  // Update Map Data
  useEffect(() => {
    if (!tmapRef.current || !window.Tmapv3 || !result) return;
    const map = tmapRef.current;
    const Tmapv3 = window.Tmapv3;

    // 1. Clear existing overlays
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
    }
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // 2. Draw Polyline
    if (result.path && result.path.length > 0) {
      const pathCoordinates = result.path.map(
        p => new Tmapv3.LatLng(p.lat, p.lng)
      );

      polylineRef.current = new Tmapv3.Polyline({
        path: pathCoordinates,
        strokeColor: "#E11D48", // Red-600 (distinctive path)
        strokeWeight: 6,
        strokeOpacity: 0.8,
        direction: true,
        map: map
      });
    }

    // 3. Draw Markers
    const bounds = new Tmapv3.LatLngBounds();

    result.stops.forEach((stop) => {
      const lat = parseFloat(stop.lat);
      const lng = parseFloat(stop.lng);
      const position = new Tmapv3.LatLng(lat, lng);
      
      bounds.extend(position);

      let iconUrl = ""; 
      
      if (stop.type === 'Start') {
        iconUrl = "https://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_s.png";
      } else if (stop.type === 'End') {
        iconUrl = "https://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_e.png";
      } else {
        // Generic blue marker for vias
        iconUrl = "https://tmapapi.sktelecom.com/upload/tmap/marker/pin_b_m_p.png";
      }

      // Create Marker
      const marker = new Tmapv3.Marker({
        position: position,
        icon: iconUrl,
        iconSize: new Tmapv3.Size(24, 38),
        map: map,
        title: stop.name
      });
      
      // If it's a Via point, we can try to add a label or just hover title
      // Tmapv3 markers support HTML content for custom markers if needed, but icon is standard.

      markersRef.current.push(marker);
    });

    // 4. Fit Bounds with padding
    if (!bounds.isEmpty()) {
       map.fitBounds(bounds);
    }

  }, [result]);

  return (
    <div className="w-full h-[400px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-100 relative z-0">
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;