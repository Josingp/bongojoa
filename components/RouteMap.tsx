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

  // Fix: Use type assertion for import.meta to avoid TS errors with env
  const metaEnv = (import.meta as any).env || {};
  // API 키 처리: Vercel 환경 변수(import.meta.env.VITE_TMAP_APP_KEY)를 최우선으로 확인
  const activeApiKey = (metaEnv.VITE_TMAP_APP_KEY || apiKey || TMAP_APP_KEY || "").trim();

  // TMAP SDK 동적 로드
  useEffect(() => {
    if (!activeApiKey) {
      console.error("TMAP SDK 로드 실패: API 키가 비어있습니다. Vercel 환경 변수(VITE_TMAP_APP_KEY)를 확인해주세요.");
      setHasError(true);
      return;
    }

    // 이미 로드되어 있는지 확인
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsReady(true);
      return;
    }

    const scriptId = 'tmap-sdk-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    
    // 스크립트 태그가 이미 존재한다면 로드 완료를 대기
    if (script) {
      const checkInterval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map) {
          setIsReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    // 스크립트 태그 생성 및 주입
    script = document.createElement('script');
    script.id = scriptId;
    
    // [수정 완료] activeApiKey 변수를 사용하여 환경 변수 적용
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
      console.error("TMAP 스크립트 로드 오류. API 키와 도메인 설정을 확인해주세요.", e);
      setHasError(true);
    };

    document.head.appendChild(script);
  }, [activeApiKey]);

  // 지도 렌더링
  useEffect(() => {
    if (!isReady || !result || !containerRef.current) return;

    // 기존 지도 인스턴스 정리
    if (mapRef.current) {
      containerRef.current.innerHTML = "";
      mapRef.current = null;
    }

    try {
      const startStop = result.stops[0];
      const centerLat = Number(startStop?.lat) || 37.5665;
      const centerLng = Number(startStop?.lng) || 126.9780;

      // 지도 초기화
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

      // 경로 그리기 (Polyline)
      if (result.path && result.path.length > 0) {
        const pathArr = result.path.map(p => new window.Tmapv2.LatLng(p.lat, p.lng));
        new window.Tmapv2.Polyline({
          path: pathArr,
          strokeColor: "#FF2222",
          strokeWeight: 6,
          map: map
        });
      }

      // 마커 추가
      const bounds = new window.Tmapv2.LatLngBounds();
      result.stops.forEach((stop) => {
        const pos = new window.Tmapv2.LatLng(Number(stop.lat), Number(stop.lng));
        bounds.extend(pos);

        const iconUrl = getMarkerIcon(stop.type, stop.sequence);

        new window.Tmapv2.Marker({
          position: pos,
          icon: iconUrl,
          iconSize: new window.Tmapv2.Size(28, 40),
          map: map,
          title: stop.name
        });
      });

      // 지도 영역 맞춤
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.fitBounds(bounds);
        }
      }, 500);

    } catch (err: any) {
      console.error("지도 초기화 실패", err);
    }
  }, [isReady, result]);

  const getMarkerIcon = (type: string, seq: number) => {
    let color = '#3b82f6';
    let text = String(seq);
    if (type === 'Start') { color = '#10b981'; text = 'S'; }
    else if (type === 'End') { color = '#ef4444'; text = 'G'; }
    
    const svg = `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.27 0 0 6.27 0 14c0 11 14 26 14 26s14-15 14-26c0-7.73-6.27-14-14-14z" fill="${color}" stroke="white" stroke-width="2"/><text x="14" y="20" font-family="Arial" font-size="12" font-weight="black" fill="white" text-anchor="middle">${text}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <div className="w-full h-[500px] rounded-3xl overflow-hidden shadow-2xl border-4 border-white bg-slate-100 relative">
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
          <p className="text-sm font-bold text-red-600 mb-1">지도를 불러올 수 없습니다.</p>
          <p className="text-[10px] text-red-400 font-medium leading-relaxed">
            Vercel 환경 변수에 VITE_TMAP_APP_KEY가<br/>
            정확히 등록되어 있는지 확인해 주세요.
          </p>
        </div>
      )}
    </div>
  );
};

export default RouteMap;