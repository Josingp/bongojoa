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

    // Sort stops just to be sure we label them in sequence order
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
      
      // Standard TMap Marker URLs (HTTPS)
      if (stop.type === 'Start') {
        iconUrl = "https://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_s.png";
        labelText = "<span style='background-color: #464646; color:white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; box-shadow: 1px 1px 2px rgba(0,0,0,0.3);'>출발</span>";
      } else if (stop.type === 'End') {
        iconUrl = "https://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_e.png";
        labelText = "<span style='background-color: #464646; color:white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; box-shadow: 1px 1px 2px rgba(0,0,0,0.3);'>도착</span>";
      } else {
        // Via Points
        iconUrl = "https://tmapapi.sktelecom.com/upload/tmap/marker/pin_b_m_p.png";
        // Via Index
        const viaIndex = stop.sequence; 
        labelText = `<span style='background-color: #3b82f6; color:white; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 11px; font-weight: bold; box-shadow: 1px 1px 2px rgba(0,0,0,0.3);'>${viaIndex}</span>`;
      }

      // Create Marker
      const marker = new Tmapv2.Marker({
        position: position,
        icon: iconUrl,
        iconSize: new Tmapv2.Size(24, 38),
        offset: new Tmapv2.Point(12, 38), // Anchor Point: Bottom Center (x:12, y:38 for 24x38 image)
        map: map,
        title: stop.name, // Tooltip on hover
        label: labelText // Custom HTML Label
      });

      markersRef.current.push(marker);
    });

    // 4. Fit Bounds
    if (hasPoints) {
       // Add a slight delay to ensure map is rendered before fitting bounds
       setTimeout(() => {
         // Add some padding to the bounds
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