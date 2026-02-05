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
        strokeColor: "#FF0000", // TMap Red
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

      let iconUrl = "";
      let labelText = "";
      
      // Select Icon based on Type
      if (stop.type === 'Start') {
        // Start Marker (Red Pin with S)
        iconUrl = "https://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_s.png";
        // Simple label below the marker
        labelText = "<span style='background-color: #333; color: white; padding: 2px 5px; border-radius: 4px; font-size: 10px;'>출발</span>";
      } else if (stop.type === 'End') {
        // End Marker (Red Pin with E)
        iconUrl = "https://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_e.png";
        labelText = "<span style='background-color: #333; color: white; padding: 2px 5px; border-radius: 4px; font-size: 10px;'>도착</span>";
      } else {
        // Via Points - Use Numbered Blue Pins (pin_b_m_1.png, etc.)
        // sequence for via points starts at 1
        const num = stop.sequence; 
        // Ensure we use a valid image for 1-24 range. 
        // If > 24, fallback to generic pin.
        if (num > 0 && num <= 24) {
             iconUrl = `https://tmapapi.sktelecom.com/upload/tmap/marker/pin_b_m_${num}.png`;
        } else {
             iconUrl = "https://tmapapi.sktelecom.com/upload/tmap/marker/pin_b_m_p.png";
        }
        // No text label needed for numbered pins as the number is on the image
      }

      // Create Marker
      const marker = new Tmapv2.Marker({
        position: position,
        icon: iconUrl,
        iconSize: new Tmapv2.Size(24, 38),
        offset: new Tmapv2.Point(12, 38), // Anchor Point: Bottom Center
        map: map,
        title: stop.name // Tooltip on hover
      });
      
      // Add label only for Start/End to clarify, Via points have numbers on icons
      if (stop.type === 'Start' || stop.type === 'End') {
          // You can create a separate Label overlay or just use the label property if supported well
          // For TMap V2, label property puts text on map.
          // Note: TMap V2 label positioning can be tricky. 
          // If visual clutter is an issue, we can omit this.
          // Let's rely on the distinctive S and E icons.
      }

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