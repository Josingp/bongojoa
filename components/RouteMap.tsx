
import React, { useEffect, useRef, useState } from 'react';
import { OptimizationResult } from '../types';
import { AlertCircle } from 'lucide-react';

interface RouteMapProps {
  result: OptimizationResult;
}

declare global {
  interface Window {
    Tmapv2: any;
  }
}

const RouteMap: React.FC<RouteMapProps> = ({ result }) => {
  const mapContainerId = "tmap_canvas_container";
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Refs for cleanup
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);
  const infoWindowsRef = useRef<any[]>([]);

  // API Key Check
  useEffect(() => {
    // 1. Check if TMAP is already loaded
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsReady(true);
      return;
    }

    // 2. Mock Tmapv2 object for loader
    if (!window.Tmapv2) {
      window.Tmapv2 = {
        _getScriptLocation: () => "https://topopentile1.tmap.co.kr/scriptSDKV2/",
        VERSION_NUMBER: 20231206
      };
    }

    const scriptId = 'tmap-jssdk-core';
    if (document.getElementById(scriptId)) {
      const checkInterval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map) {
          setIsReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    // 3. Inject Script
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = "https://topopentile1.tmap.co.kr/scriptSDKV2/tmapjs2.min.js?version=20231206";
    script.async = true;
    
    script.onload = () => {
      const checkInterval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map && window.Tmapv2.LatLng) {
          setIsReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
    };

    script.onerror = (e) => {
      console.error("TMAP Script Error", e);
      setHasError(true);
    };

    document.head.appendChild(script);
  }, []);

  // Render Map Logic
  useEffect(() => {
    if (!isReady || !result || !containerRef.current) return;

    // Cleanup previous map objects
    if (mapRef.current) {
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
      infoWindowsRef.current.forEach(w => w.setMap(null));
      infoWindowsRef.current = [];
      
      // Clear map container and reset instance to ensure clean render
      containerRef.current.innerHTML = ""; 
      mapRef.current = null;
    }

    try {
      const startStop = result.stops[0];
      const centerLat = Number(startStop?.lat) || 37.5665;
      const centerLng = Number(startStop?.lng) || 126.9780;

      // 1. Create Map
      const map = new window.Tmapv2.Map(mapContainerId, {
        center: new window.Tmapv2.LatLng(centerLat, centerLng),
        width: "100%",
        height: "500px",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true,
        httpsMode: true
      });
      
      mapRef.current = map;

      // 2. Draw Polylines (Traffic Segments)
      if (result.segments && result.segments.length > 0) {
        result.segments.forEach((segment, idx) => {
          const pathArr = segment.path.map(p => new window.Tmapv2.LatLng(p.lat, p.lng));
          
          const polyline = new window.Tmapv2.Polyline({
            path: pathArr,
            strokeColor: segment.color || "#3b82f6",
            strokeWeight: 6,
            strokeOpacity: 1,
            strokeStyle: 'solid',
            zIndex: 1,
            map: map
          });
          polylinesRef.current.push(polyline);
        });
      } else if (result.path && result.path.length > 0) {
        // Fallback for single line if no segments
        const pathArr = result.path.map(p => new window.Tmapv2.LatLng(p.lat, p.lng));
        const polyline = new window.Tmapv2.Polyline({
          path: pathArr,
          strokeColor: "#3b82f6",
          strokeWeight: 6,
          strokeOpacity: 0.8,
          map: map
        });
        polylinesRef.current.push(polyline);
      }

      // 3. Markers & InfoWindows
      const bounds = new window.Tmapv2.LatLngBounds();
      
      result.stops.forEach((stop) => {
        const lat = Number(stop.lat);
        const lng = Number(stop.lng);
        const pos = new window.Tmapv2.LatLng(lat, lng);
        bounds.extend(pos);

        // Marker Icon
        const iconUrl = getMarkerIcon(stop.type, stop.sequence);
        const iconSize = new window.Tmapv2.Size(32, 48);

        const marker = new window.Tmapv2.Marker({
          position: pos,
          icon: iconUrl,
          iconSize: iconSize,
          map: map,
          title: stop.name,
          draggable: false,
          zIndex: 100 // Markers on top of lines
        });

        const typeLabel = stop.type === 'Start' ? '출발' : stop.type === 'End' ? '도착' : '경유';
        const infoContent = `
          <div style="padding: 10px; background: white; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); min-width: 150px; text-align: center; font-family: sans-serif;">
            <div style="font-size: 11px; font-weight: bold; color: #64748b; margin-bottom: 4px;">${typeLabel}</div>
            <div style="font-size: 14px; font-weight: bold; color: #1e293b; margin-bottom: ${stop.address && stop.address !== stop.name ? '2px' : '6px'};">${stop.name}</div>
            ${stop.address && stop.address !== stop.name ? `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px; max-width: 220px;">${stop.address}</div>` : ''}
            <div style="display: inline-block; padding: 4px 8px; background: #eff6ff; color: #2563eb; border-radius: 4px; font-size: 12px; font-weight: bold;">
              ${stop.arrivalTime} 도착
            </div>
          </div>
        `;

        const infoWindow = new window.Tmapv2.InfoWindow({
            position: pos,
            content: infoContent,
            border: '0px',
            background: false,
            type: 2,
            map: null
        });

        marker.addListener("click", () => {
          infoWindowsRef.current.forEach(w => w.setMap(null));
          infoWindow.setMap(map);
        });

        markersRef.current.push(marker);
        infoWindowsRef.current.push(infoWindow);
      });

      // 4. Fit Bounds with padding
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.fitBounds(bounds);
        }
      }, 300);

    } catch (err: any) {
      console.error("Map Render Error", err);
    }
  }, [isReady, result]);

  const getMarkerIcon = (type: string, seq: number) => {
    let color = '#3b82f6';
    let text = String(seq);
    let fontSize = 14;

    if (type === 'Start') {
      color = '#10b981'; text = '출발'; fontSize = 9;
    } else if (type === 'End') {
      color = '#ef4444'; text = '도착'; fontSize = 9;
    }

    const svg = `<svg width="32" height="48" viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 13 16 32 16 32s16-19 16-32c0-8.84-7.16-16-16-16z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="16" r="10" fill="white" opacity="0.2"/>
      <text x="16" y="${fontSize <= 10 ? 20 : 21}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">${text}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <div className="w-full h-[500px] rounded-3xl overflow-hidden shadow-2xl border-4 border-white bg-slate-100 relative group">
      <div id={mapContainerId} ref={containerRef} className="w-full h-full" style={{ minHeight: '500px' }} />
      
      {(!isReady && !hasError) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/90 backdrop-blur-sm z-10">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-bold text-slate-500 tracking-tight uppercase">지도 불러오는 중...</p>
        </div>
      )}
    </div>
  );
};

export default RouteMap;
