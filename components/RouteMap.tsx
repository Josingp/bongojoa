import React, { useEffect, useRef, useState } from 'react';
import { OptimizationResult } from '../types';
import { TMAP_APP_KEY } from '../constants'; // 위에서 하드코딩한 키를 가져옴
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
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // [핵심] 그냥 constants.ts에 있는 키를 씁니다.
  const activeApiKey = TMAP_APP_KEY;

  // 1. TMAP 스크립트 로드
  useEffect(() => {
    // 이미 로드되어 있다면 패스
    if (window.Tmapv2 && window.Tmapv2.Map) {
      setIsReady(true);
      return;
    }

    const scriptId = 'tmap-sdk-script';
    // 중복 로드 방지
    if (document.getElementById(scriptId)) return;

    const script = document.createElement('script');
    script.id = scriptId;
    // 하드코딩된 키가 들어간 주소
    script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${activeApiKey}`;
    script.async = true;
    
    script.onload = () => {
      // 로드 완료 후 객체 생성 대기
      const checkInterval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map) {
          setIsReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
    };

    document.head.appendChild(script);
  }, [activeApiKey]);

  // 2. 지도 그리기
  useEffect(() => {
    if (!isReady || !result || !containerRef.current) return;

    // 기존 맵 초기화
    if (mapRef.current) {
        containerRef.current.innerHTML = "";
        mapRef.current = null;
    }

    try {
      const startStop = result.stops[0];
      const centerLat = Number(startStop?.lat) || 37.5665;
      const centerLng = Number(startStop?.lng) || 126.9780;

      // 지도 생성
      const map = new window.Tmapv2.Map(mapContainerId, {
        center: new window.Tmapv2.LatLng(centerLat, centerLng),
        width: "100%",
        height: "500px",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true
      });
      mapRef.current = map;

      // 경로 선 그리기
      if (result.path && result.path.length > 0) {
        const pathArr = result.path.map(p => new window.Tmapv2.LatLng(p.lat, p.lng));
        new window.Tmapv2.Polyline({
          path: pathArr,
          strokeColor: "#FF2222",
          strokeWeight: 6,
          map: map
        });
      }

      // 마커 찍기
      const bounds = new window.Tmapv2.LatLngBounds();
      result.stops.forEach((stop, idx) => {
        const lat = Number(stop.lat);
        const lng = Number(stop.lng);
        if (!isNaN(lat)) {
            const pos = new window.Tmapv2.LatLng(lat, lng);
            bounds.extend(pos);
            
            new window.Tmapv2.Marker({
                position: pos,
                map: map,
                title: stop.name,
                label: String(idx + 1) // 단순 라벨 마커 사용
            });
        }
      });

      map.fitBounds(bounds);

    } catch (err) {
      console.error("지도 그리기 실패:", err);
    }
  }, [isReady, result]);

  return (
    <div className="w-full h-[500px] rounded-3xl overflow-hidden shadow-2xl border-4 border-white bg-slate-100 relative">
      <div 
        id={mapContainerId} 
        ref={containerRef}
        className="w-full h-full" 
        style={{ minHeight: '500px' }} 
      />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 z-10">
          <p className="text-gray-500 font-bold">지도 로딩 중...</p>
        </div>
      )}
    </div>
  );
};

export default RouteMap;
