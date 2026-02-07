
import React, { useEffect, useRef, useState } from 'react';
import { OptimizationResult } from '../types';
import { TMAP_APP_KEY } from '../constants';
import { AlertCircle } from 'lucide-react';

interface RouteMapProps {
  result: OptimizationResult;
  apiKey?: string;
}

declare global {
  interface Window {
    Tmapv2: any;
  }
}

const RouteMap: React.FC<RouteMapProps> = ({ result, apiKey }) => {
  const mapContainerId = "tmap_canvas_container";
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 마커와 팝업(InfoWindow) 객체를 추적하기 위한 Refs
  const markersRef = useRef<any[]>([]);
  const infoWindowsRef = useRef<any[]>([]);

  // API 키 로드
  const metaEnv = (import.meta as any).env || {};
  const activeApiKey = (apiKey || metaEnv.VITE_TMAP_APP_KEY || TMAP_APP_KEY || "").trim();

  // TMAP SDK 로드
  useEffect(() => {
    if (!activeApiKey) {
      console.error("TMAP SDK 로드 실패: API 키가 없습니다.");
      setHasError(true);
      return;
    }

    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsReady(true);
      return;
    }

    const scriptId = 'tmap-sdk-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    
    if (script) {
      const checkInterval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map) {
          setIsReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    script = document.createElement('script');
    script.id = scriptId;
    script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${activeApiKey}`;
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
      console.error("TMAP 스크립트 로드 오류", e);
      setHasError(true);
    };

    document.head.appendChild(script);
  }, [activeApiKey]);

  // 지도 및 마커 렌더링
  useEffect(() => {
    if (!isReady || !result || !containerRef.current) return;

    // 기존 맵 초기화
    if (mapRef.current) {
      // 기존 마커 및 팝업 제거
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      infoWindowsRef.current.forEach(w => w.setMap(null));
      infoWindowsRef.current = [];
      
      // 맵 HTML 초기화 (새로운 인스턴스를 위해)
      containerRef.current.innerHTML = "";
      mapRef.current = null;
    }

    try {
      const startStop = result.stops[0];
      const centerLat = Number(startStop?.lat) || 37.5665;
      const centerLng = Number(startStop?.lng) || 126.9780;

      // 1. 지도 생성
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

      // 2. 경로(Polyline) 그리기
      if (result.path && result.path.length > 0) {
        const pathArr = result.path.map(p => new window.Tmapv2.LatLng(p.lat, p.lng));
        new window.Tmapv2.Polyline({
          path: pathArr,
          strokeColor: "#3b82f6", // Blue color like TMAP
          strokeWeight: 6,
          strokeOpacity: 0.8,
          map: map
        });
      }

      // 3. 마커 및 InfoWindow 추가
      const bounds = new window.Tmapv2.LatLngBounds();
      
      result.stops.forEach((stop) => {
        const lat = Number(stop.lat);
        const lng = Number(stop.lng);
        const pos = new window.Tmapv2.LatLng(lat, lng);
        bounds.extend(pos);

        // 마커 아이콘 설정
        const iconUrl = getMarkerIcon(stop.type, stop.sequence);
        const iconSize = new window.Tmapv2.Size(32, 48); // Slightly larger

        const marker = new window.Tmapv2.Marker({
          position: pos,
          icon: iconUrl,
          iconSize: iconSize,
          map: map,
          title: stop.name,
          draggable: false
        });

        // 팝업 내용 (HTML)
        const typeLabel = stop.type === 'Start' ? '출발' : stop.type === 'End' ? '도착' : '경유';
        const infoContent = `
          <div style="padding: 10px; background: white; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); min-width: 150px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #64748b; margin-bottom: 4px;">${typeLabel}</div>
            <div style="font-size: 14px; font-weight: bold; color: #1e293b; margin-bottom: 6px;">${stop.name}</div>
            <div style="display: inline-block; padding: 4px 8px; background: #eff6ff; color: #2563eb; border-radius: 4px; font-size: 12px; font-weight: bold;">
              ${stop.arrivalTime} 도착
            </div>
          </div>
        `;

        // InfoWindow 생성 (초기에는 숨김 상태일 수 있으나 TMAP V2 InfoWindow는 생성 시 표시됨)
        // 여기서는 클릭 시에만 표시되도록 하거나, 기본적으로 띄우되 다른 것 클릭 시 닫기 구현
        // 편의상 마커 클릭 이벤트를 추가합니다.
        
        const infoWindow = new window.Tmapv2.InfoWindow({
            position: pos,
            content: infoContent,
            border: '0px',
            background: false,
            type: 2, // Type 2 is custom HTML
            map: null // 처음엔 숨김
        });

        // 마커 클릭 이벤트 리스너
        marker.addListener("click", () => {
          // 다른 열린 팝업 모두 닫기
          infoWindowsRef.current.forEach(w => w.setMap(null));
          // 현재 팝업 열기
          infoWindow.setMap(map);
        });

        markersRef.current.push(marker);
        infoWindowsRef.current.push(infoWindow);
      });

      // 4. 지도 영역 자동 조정
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.fitBounds(bounds);
        }
      }, 300);

    } catch (err: any) {
      console.error("지도 초기화 실패", err);
    }
  }, [isReady, result]);

  const getMarkerIcon = (type: string, seq: number) => {
    let color = '#3b82f6'; // Blue
    let text = String(seq);
    if (type === 'Start') { color = '#10b981'; text = 'S'; } // Emerald
    else if (type === 'End') { color = '#ef4444'; text = 'E'; } // Red
    
    // SVG Marker with clearer number
    const svg = `
      <svg width="32" height="48" viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.16 0 0 7.16 0 16c0 13 16 32 16 32s16-19 16-32c0-8.84-7.16-16-16-16z" fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="16" cy="16" r="10" fill="white" opacity="0.2"/>
        <text x="16" y="21" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">${text}</text>
      </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <div className="w-full h-[500px] rounded-3xl overflow-hidden shadow-2xl border-4 border-white bg-slate-100 relative group">
      <div 
        id={mapContainerId} 
        ref={containerRef}
        className="w-full h-full" 
        style={{ minHeight: '500px' }} 
      />
      
      {/* 로딩 중 화면 */}
      {(!isReady && !hasError) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/90 backdrop-blur-sm z-10">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-bold text-slate-500 tracking-tight uppercase">TMAP 로드 중...</p>
        </div>
      )}

      {/* 에러 화면 */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 z-10 p-6 text-center">
          <AlertCircle className="text-red-500 mb-2" size={32} />
          <p className="text-sm font-bold text-red-600 mb-1">지도를 불러올 수 없습니다.</p>
          <p className="text-[10px] text-red-400 font-medium leading-relaxed">
            API 키 설정을 확인해주세요.
          </p>
        </div>
      )}
      
      {isReady && !hasError && (
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-slate-200 text-[10px] text-slate-500 font-bold pointer-events-none z-[5]">
          마커를 클릭하여 도착 시간을 확인하세요
        </div>
      )}
    </div>
  );
};

export default RouteMap;
