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
  const mapId = "tmap_layer_div";
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const mapInstance = useRef<any>(null);
  const isMounted = useRef(false);

  // 1. TMAP SDK 로드 (폴링 방식)
  useEffect(() => {
    isMounted.current = true;

    if (!apiKey) {
      console.error("API Key is missing");
      setStatus('error');
      return;
    }

    const loadScript = () => {
      // 1. 이미 로드되어 있고 사용 가능한 경우
      if (window.Tmapv2 && window.Tmapv2.Map && window.Tmapv2.LatLng) {
        setStatus('success');
        return;
      }

      // 2. 스크립트 태그가 없으면 추가
      if (!document.getElementById('tmap_jssdk')) {
        const script = document.createElement('script');
        script.id = 'tmap_jssdk';
        script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
        script.async = true;
        document.head.appendChild(script);
      }

      // 3. 사용 가능해질 때까지 반복 체크 (0.1초 간격)
      const interval = setInterval(() => {
        if (window.Tmapv2 && window.Tmapv2.Map && window.Tmapv2.LatLng) {
          clearInterval(interval);
          if (isMounted.current) setStatus('success');
        }
      }, 100);

      // 4. 타임아웃 설정 (10초)
      setTimeout(() => {
        clearInterval(interval);
        if (isMounted.current && (!window.Tmapv2 || !window.Tmapv2.Map)) {
          setStatus('error');
        }
      }, 10000);
    };

    loadScript();

    return () => {
      isMounted.current = false;
    };
  }, [apiKey]);

  // 2. 지도 그리기
  useEffect(() => {
    if (status !== 'success' || !result) return;

    const container = document.getElementById(mapId);
    if (!container) return;

    // 초기화: 기존 맵이 있으면 DOM을 비움
    container.innerHTML = "";
    mapInstance.current = null;

    try {
      const startNode = result.stops[0];
      const startLat = Number(startNode?.lat) || 37.5665;
      const startLng = Number(startNode?.lng) || 126.9780;

      // 지도 생성
      const map = new window.Tmapv2.Map(mapId, {
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
          strokeColor: "#2563eb", // 진한 파랑
          strokeWeight: 6,
          strokeOpacity: 1, // 불투명하게 잘 보이도록
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

        new window.Tmapv2.Marker({
          position: point,
          icon: createMarkerIcon(stop.type, stop.sequence),
          iconSize: new window.Tmapv2.Size(50, 60), // 마커 크기 대폭 확대
          offset: new window.Tmapv2.Point(25, 60),  // 중앙 하단 앵커
          map: map,
          title: stop.name
        });
      });

      // 핏 바운드 (화면에 꽉 차게)
      if (hasPoints) {
        // 지도가 렌더링될 시간을 조금 줌
        setTimeout(() => {
          map.fitBounds(bounds, 80); // 여백을 넉넉히 80px 줌
        }, 300);
      }

    } catch (e) {
      console.error("Map Drawing Failed:", e);
      setStatus('error');
    }

  }, [status, result]); // result나 status가 바뀌면 다시 그림

  // SVG 마커 생성 함수
  const createMarkerIcon = (type: 'Start' | 'End' | 'Via', sequence?: number) => {
    let color = '#2563eb'; // 파랑
    let label = sequence ? sequence.toString() : '';
    let textColor = '#ffffff';

    if (type === 'Start') {
      color = '#16a34a'; // 초록
      label = '출발';
    } else if (type === 'End') {
      color = '#dc2626'; // 빨강
      label = '도착';
    }

    const svg = `
      <svg width="50" height="60" viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-50%" y="-20%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="0" dy="2" result="offsetblur"/>
            <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <g filter="url(#shadow)">
            <path d="M25 0C11.2 0 0 11.2 0 25c0 15 25 35 25 35s25-20 25-35c0-13.8-11.2-25-25-25z" fill="${color}" stroke="white" stroke-width="2.5"/>
            <circle cx="25" cy="25" r="14" fill="white" opacity="0.2"/>
            <text x="25" y="30" font-family="sans-serif" font-weight="bold" font-size="${label.length > 1 ? '10' : '16'}" fill="white" text-anchor="middle">${label}</text>
        </g>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <div className="w-full h-[500px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50 relative z-0">
      
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 font-bold">지도 데이터를 불러오는 중...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10 p-6 text-center">
          <div className="text-red-500 font-bold text-xl mb-2">지도 로드 실패</div>
          <p className="text-gray-600 mb-4">API 키가 올바른지 확인하거나 페이지를 새로고침 해주세요.</p>
          <button 
             onClick={() => window.location.reload()}
             className="px-4 py-2 bg-white border border-gray-300 rounded shadow hover:bg-gray-50"
          >
            새로고침
          </button>
        </div>
      )}

      <div id={mapId} className="w-full h-full" />
    </div>
  );
};

export default RouteMap;