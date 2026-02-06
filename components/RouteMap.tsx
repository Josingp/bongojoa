import React, { useEffect, useRef, useState } from 'react';
import { OptimizationResult } from '../types';

interface RouteMapProps {
  result: OptimizationResult;
  apiKey: string;
}

declare global {
  interface Window {
    Tmapv2: any;
  }
}

const RouteMap: React.FC<RouteMapProps> = ({ result, apiKey }) => {
  const mapContainerId = "tmap_container_div";
  const [isTmapLoaded, setIsTmapLoaded] = useState(false);
  const mapInstance = useRef<any>(null);

  // 1. TMAP 스크립트 로드 로직 (가장 단순하고 확실한 방법)
  useEffect(() => {
    // 이미 로드되어 있고 사용할 준비가 되었다면 즉시 처리
    if (window.Tmapv2 && typeof window.Tmapv2.Map === 'function') {
      setIsTmapLoaded(true);
      return;
    }

    // 스크립트가 없다면 삽입
    const scriptId = 'tmap-script-v2';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
      script.async = true;
      
      // 스크립트 로드 완료 후 실행
      script.onload = () => {
        // onload가 발생해도 내부 모듈(LatLng 등)이 비동기로 초기화될 수 있으므로
        // 확실하게 존재할 때까지 잠시 기다립니다.
        const checkInit = setInterval(() => {
          if (window.Tmapv2 && window.Tmapv2.LatLng) {
            clearInterval(checkInit);
            setIsTmapLoaded(true);
          }
        }, 100);
        
        // 5초 뒤에도 안되면 인터벌 종료
        setTimeout(() => clearInterval(checkInit), 5000);
      };

      document.head.appendChild(script);
    } else {
      // 스크립트 태그는 있지만 아직 로드 안된 경우를 대비해 폴링
      const checkLoop = setInterval(() => {
         if (window.Tmapv2 && window.Tmapv2.LatLng) {
           clearInterval(checkLoop);
           setIsTmapLoaded(true);
         }
      }, 500);
      return () => clearInterval(checkLoop);
    }
  }, [apiKey]);

  // 2. 지도 그리기 로직 (isTmapLoaded가 true일 때만 실행)
  useEffect(() => {
    if (!isTmapLoaded || !result) return;
    const container = document.getElementById(mapContainerId);
    if (!container) return;

    // 기존 맵 인스턴스 정리 (DOM 비우기)
    container.innerHTML = "";
    mapInstance.current = null;

    try {
      const startNode = result.stops[0];
      const startLat = Number(startNode?.lat) || 37.5665;
      const startLng = Number(startNode?.lng) || 126.9780;

      // 지도 생성
      const map = new window.Tmapv2.Map(mapContainerId, {
        center: new window.Tmapv2.LatLng(startLat, startLng),
        width: "100%",
        height: "100%",
        zoom: 14,
        zoomControl: true,
        scrollwheel: true
      });
      mapInstance.current = map;

      // 경로선(Polyline) 그리기
      if (result.path && result.path.length > 0) {
        const pathCoords = result.path.map(p => 
          new window.Tmapv2.LatLng(p.lat, p.lng)
        );

        new window.Tmapv2.Polyline({
          path: pathCoords,
          strokeColor: "#2563eb", // 파란색
          strokeWeight: 6,
          strokeOpacity: 0.8,
          direction: true,
          map: map
        });
      }

      // 마커 그리기
      const bounds = new window.Tmapv2.LatLngBounds();
      let hasPoints = false;

      result.stops.forEach((stop) => {
        const lat = Number(stop.lat);
        const lng = Number(stop.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const point = new window.Tmapv2.LatLng(lat, lng);
        bounds.extend(point);
        hasPoints = true;

        // 마커 생성
        new window.Tmapv2.Marker({
          position: point,
          icon: createMarkerIcon(stop.type, stop.sequence),
          iconSize: new window.Tmapv2.Size(42, 58), // 마커 크기 확대
          offset: new window.Tmapv2.Point(21, 58),  // 하단 중앙 앵커
          map: map,
          title: stop.name
        });
      });

      // 지도 영역 맞추기 (약간의 딜레이를 주어 지도가 완전히 렌더링된 후 실행)
      if (hasPoints) {
        setTimeout(() => {
          map.fitBounds(bounds, 50); // 여백 50px
        }, 100);
      }

    } catch (e) {
      console.error("Map Drawing Error:", e);
    }
  }, [isTmapLoaded, result]);


  // 마커 아이콘 생성 (SVG)
  const createMarkerIcon = (type: 'Start' | 'End' | 'Via', sequence?: number) => {
    let color = '#3b82f6'; // 기본 파랑 (경유지)
    let label = sequence ? String(sequence) : '';
    let labelColor = '#3b82f6';
    
    if (type === 'Start') {
      color = '#22c55e'; // 초록
      label = 'S';
      labelColor = '#22c55e';
    } else if (type === 'End') {
      color = '#ef4444'; // 빨강
      label = 'E';
      labelColor = '#ef4444';
    }

    // 시인성 좋은 핀 모양 SVG
    const svg = `
      <svg width="42" height="58" viewBox="0 0 42 58" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-50%" y="-20%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="0" dy="2" result="offsetblur"/>
            <feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <g filter="url(#shadow)">
            <!-- 핀 헤드 -->
            <path d="M21 0C9.4 0 0 9.4 0 21c0 12.5 21 37 21 37s21-24.5 21-37c0-11.6-9.4-21-21-21z" fill="${color}" stroke="white" stroke-width="2"/>
            <!-- 내부 흰 원 -->
            <circle cx="21" cy="21" r="12" fill="white"/>
            <!-- 텍스트 -->
            <text x="21" y="27" font-family="sans-serif" font-weight="900" font-size="16" fill="${labelColor}" text-anchor="middle">${label}</text>
        </g>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <div className="w-full h-[500px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative z-0">
      {!isTmapLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-500 font-medium">지도를 불러오는 중입니다...</p>
        </div>
      )}
      <div id={mapContainerId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;