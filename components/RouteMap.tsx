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

  // [핵심] API 키 불러오기 로직
  // 1. import.meta.env (Vite/Vercel 환경변수) 확인
  // 2. 부모 컴포넌트에서 받은 apiKey 확인
  // 3. constants.ts의 기본값 확인
  const metaEnv = (import.meta as any).env || {};
  const activeApiKey = (metaEnv.VITE_TMAP_APP_KEY || apiKey || TMAP_APP_KEY || "").trim();

  // TMAP SDK 스크립트 동적 로드
  useEffect(() => {
    // 키가 없으면 에러 처리
    if (!activeApiKey) {
      console.error("TMAP SDK 로드 실패: API 키가 없습니다. Vercel 환경 변수(VITE_TMAP_APP_KEY)를 확인해주세요.");
      setHasError(true);
      return;
    }

    // 이미 로드되어 있다면 바로 준비 상태로 변경
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsReady(true);
      return;
    }

    const scriptId = 'tmap-sdk-script';
    
    // 이미 다른 곳에서 스크립트를 로드 중이라면 완료될 때까지 대기
    if (document.getElementById(scriptId)) {
      const checkInterval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map) {
          setIsReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    // [중요] 스크립트 태그를 생성해서 HTML에 주입
    const script = document.createElement('script');
    script.id = scriptId;
    // 여기서 ${activeApiKey} 자리에 Vercel에서 가져온 진짜 키가 들어갑니다.
    script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${activeApiKey}`;
    script.async = true;
    
    script.onload = () => {
      // 로드 완료 후 Tmap 객체 생성 대기
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

  // 지도 그리기 (스크립트 로드 완료 & 데이터 있음)
  useEffect(() => {
    if (!isReady || !result || !containerRef.current) return;

    // 기존 지도가 있으면 초기화 (중복 방지)
    if (mapRef.current) {
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

      // 2. 경로 선 그리기
      if (result.path && result.path.length > 0) {
        const pathArr = result.path.map(p => new window.Tmapv2.LatLng(p.lat, p.lng));
        new window.Tmapv2.Polyline({
          path: pathArr,
          strokeColor: "#FF2222",
          strokeWeight: 6,
          map: map
        });
      }

      // 3. 마커 찍기
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

      // 4. 지도 영역 자동 조정
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.fitBounds(bounds);
        }
      }, 500);

    } catch (err: any) {
      console.error("지도 초기화 실패", err);
    }
  }, [isReady, result]);

  // 마커 아이콘 생성 함수
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
      
      {/* 로딩 중 화면 */}
      {(!isReady && !hasError) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/90 backdrop-blur-sm z-10">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-bold text-slate-500 tracking-tight uppercase">지도 불러오는 중...</p>
        </div>
      )}

      {/* 에러 화면 */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 z-10 p-6 text-center">
          <AlertCircle className="text-red-500 mb-2" size={32} />
          <p className="text-sm font-bold text-red-600 mb-1">지도를 불러올 수 없습니다.</p>
          <p className="text-[10px] text-red-400 font-medium leading-relaxed">
            Vercel 설정에서 <b>VITE_TMAP_APP_KEY</b>가<br/>
            등록되었는지 확인하고 <b>Redeploy</b> 해주세요.
          </p>
        </div>
      )}
    </div>
  );
};

export default RouteMap;