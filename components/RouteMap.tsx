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
  const mapContainerId = "tmap_unique_container";
  const mapInstance = useRef<any>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // 1. 스크립트 로드 및 라이브러리 준비 확인 (가장 단순하고 확실한 방법)
  useEffect(() => {
    if (!apiKey) return;

    // 이미 로드되어 있고 사용 가능한 상태인지 체크
    if (window.Tmapv2 && window.Tmapv2.LatLng && window.Tmapv2.Map) {
      setIsMapReady(true);
      return;
    }

    // 스크립트 태그 삽입
    if (!document.getElementById('tmap-script')) {
      const script = document.createElement('script');
      script.id = 'tmap-script';
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
      script.async = true;
      document.head.appendChild(script);
    }

    // TMAP 객체가 완전히 생성될 때까지 주기적으로 확인 (Polling)
    // onload 이벤트보다 이 방식이 TMap v2에서는 훨씬 안정적입니다.
    const checkInterval = setInterval(() => {
      if (window.Tmapv2 && window.Tmapv2.LatLng && window.Tmapv2.Map) {
        clearInterval(checkInterval);
        setIsMapReady(true);
      }
    }, 500); // 0.5초마다 확인

    // 10초 뒤에도 안되면 인터벌 종료 (무한 루프 방지)
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
    }, 10000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [apiKey]);


  // 2. 지도 그리기
  useEffect(() => {
    if (!isMapReady || !result) return;

    const container = document.getElementById(mapContainerId);
    if (!container) return;

    // 기존 지도가 있다면 초기화 (삭제 후 재생성 대신 내용 비우기)
    if (mapInstance.current) {
        // TMAP은 destroy 메서드가 명확치 않으므로 DOM을 비우고 참조를 끊습니다.
        container.innerHTML = "";
        mapInstance.current = null;
    }

    try {
      // 데이터 준비
      const startNode = result.stops[0];
      const startLat = parseFloat(startNode?.lat) || 37.5665;
      const startLng = parseFloat(startNode?.lng) || 126.9780;

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

      // 경로(Polyline) 그리기
      if (result.path && result.path.length > 0) {
        const pathCoords = result.path.map(p => 
          new window.Tmapv2.LatLng(p.lat, p.lng)
        );

        new window.Tmapv2.Polyline({
          path: pathCoords,
          strokeColor: "#2563eb",
          strokeWeight: 6,
          strokeOpacity: 0.8,
          direction: true,
          map: map
        });
      }

      // 마커 및 범위 설정
      const bounds = new window.Tmapv2.LatLngBounds();
      let hasPoints = false;

      result.stops.forEach((stop) => {
        const lat = parseFloat(stop.lat);
        const lng = parseFloat(stop.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const position = new window.Tmapv2.LatLng(lat, lng);
        bounds.extend(position);
        hasPoints = true;

        // 마커 생성
        new window.Tmapv2.Marker({
          position: position,
          icon: createMarkerIcon(stop.type, stop.sequence),
          iconSize: new window.Tmapv2.Size(36, 48),
          offset: new window.Tmapv2.Point(18, 48),
          map: map,
          title: stop.name
        });
      });

      // 모든 마커가 보이도록 줌 조정
      if (hasPoints) {
        // 지도가 렌더링될 시간을 아주 잠깐 준 뒤 fitBounds 실행
        setTimeout(() => map.fitBounds(bounds), 100);
      }

    } catch (error) {
      console.error("Map Drawing Error:", error);
    }

    // 언마운트 시 정리
    return () => {
      if (mapInstance.current) {
        // 여기서 DOM을 비우면 깜빡임이 발생할 수 있으므로, 
        // 다음 렌더링 직전에 비우는 위쪽 로직에 의존하거나 필요한 경우만 정리합니다.
      }
    };
  }, [isMapReady, result]); // result가 바뀔 때마다 재실행


  // 마커 아이콘 생성 헬퍼
  const createMarkerIcon = (type: 'Start' | 'End' | 'Via', sequence?: number) => {
    let color = '#2563eb'; // Blue
    let text = sequence?.toString() || '';
    
    if (type === 'Start') { color = '#16a34a'; text = 'S'; } // Green
    else if (type === 'End') { color = '#dc2626'; text = 'E'; } // Red
  
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
        <defs>
          <filter id="shadow" x="-50%" y="-20%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="0" dy="2" result="offsetblur"/>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <path fill="${color}" d="M18 0C8.06 0 0 8.06 0 18c0 11 18 30 18 30s18-19 18-30c0-9.94-8.06-18-18-18z" filter="url(#shadow)" stroke="white" stroke-width="1.5"/>
        <circle cx="18" cy="18" r="10" fill="white" opacity="0.9"/>
        <text x="18" y="23" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="${color}" text-anchor="middle">${text}</text>
      </svg>
    `.trim();
  
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <div className="w-full h-[450px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative z-0">
      {!isMapReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10">
           <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
           <p className="text-sm text-gray-500">지도 로딩 중...</p>
        </div>
      )}
      <div id={mapContainerId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;