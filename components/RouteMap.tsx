
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

  // API 키 로드 (Props -> Vite Env -> Constants)
  const metaEnv = (import.meta as any).env || {};
  const activeApiKey = (apiKey || metaEnv.VITE_TMAP_APP_KEY || TMAP_APP_KEY || "").trim();

  // TMAP SDK 직접 로드 (document.write 문제 해결)
  useEffect(() => {
    // 1. 이미 로드되어 있는지 확인
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsReady(true);
      return;
    }

    // 2. Tmapv2 객체 수동 초기화 (로더 스크립트 역할 대행)
    if (!window.Tmapv2) {
      window.Tmapv2 = {
        _getScriptLocation: () => "https://topopentile1.tmap.co.kr/scriptSDKV2/",
        VERSION_NUMBER: 20231206
      };
    }

    const scriptId = 'tmap-jssdk-core';
    if (document.getElementById(scriptId)) {
      // 이미 스크립트 태그가 있으면 로드 완료 대기
      const checkInterval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map) {
          setIsReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    // 3. 실제 엔진 스크립트 직접 주입
    // TMAP 로더가 사용하는 실제 JS 파일 경로입니다.
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
      console.error("TMAP 스크립트 로드 오류", e);
      setHasError(true);
    };

    document.head.appendChild(script);
  }, []); // 마운트 시 한 번만 실행

  // 지도 및 마커 렌더링
  useEffect(() => {
    if (!isReady || !result || !containerRef.current) return;

    // 기존 맵 초기화
    if (mapRef.current) {
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      infoWindowsRef.current.forEach(w => w.setMap(null));
      infoWindowsRef.current = [];
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
          strokeColor: "#3b82f6",
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
        const iconSize = new window.Tmapv2.Size(32, 48);

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
          <div style="padding: 10px; background: white; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); min-width: 150px; text-align: center; font-family: sans-serif;">
            <div style="font-size: 11px; font-weight: bold; color: #64748b; margin-bottom: 4px;">${typeLabel}</div>
            <div style="font-size: 14px; font-weight: bold; color: #1e293b; margin-bottom: 6px;">${stop.name}</div>
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
            type: 2, // HTML 타입
            map: null // 처음엔 숨김
        });

        // 마커 클릭 시 팝업 표시
        marker.addListener("click", () => {
          infoWindowsRef.current.forEach(w => w.setMap(null)); // 다른 팝업 닫기
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
    
    // SVG Marker
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
      
      {(!isReady && !hasError) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/90 backdrop-blur-sm z-10">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-bold text-slate-500 tracking-tight uppercase">지도 불러오는 중...</p>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 z-10 p-6 text-center">
          <AlertCircle className="text-red-500 mb-2" size={32} />
          <p className="text-sm font-bold text-red-600 mb-1">지도를 표시할 수 없습니다.</p>
          <p className="text-[10px] text-red-400 font-medium leading-relaxed">
            네트워크 상태를 확인해주세요.
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
