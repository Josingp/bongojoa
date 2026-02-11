// components/Timeline.tsx

import React, { useEffect, useState } from 'react';
import { OptimizationResult, FuelType } from '../types';
import { 
    Clock, Navigation, MapPin, Flag, Timer, Route, MoveDown, 
    Target, Coins, Fuel, Hourglass, Info, CloudSun, CloudRain, AlertTriangle, Loader2 
} from 'lucide-react';

interface TimelineProps {
  result: OptimizationResult;
  fuelType: FuelType;
  oilPrices: { GASOLINE: number; DIESEL: number };
  fuelMode: 'TMAP' | 'CUSTOM';
  fuelEfficiency: number;
}

const Timeline: React.FC<TimelineProps> = ({ 
    result, 
    fuelType, 
    oilPrices, 
    fuelMode, 
    fuelEfficiency 
}) => {
  const { stops, summary, targetDateTime, path } = result;

  // 날씨 상태 관리
  const [weatherBriefing, setWeatherBriefing] = useState<string | null>(null);
  const [isWeatherWarning, setIsWeatherWarning] = useState(false);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);

  // 경로 데이터가 변경될 때마다 날씨 정보 조회
  useEffect(() => {
    if (!result || stops.length < 2) return;

    const fetchWeather = async () => {
        setIsWeatherLoading(true);
        setWeatherBriefing(null);
        
        try {
            const startStop = stops[0];
            const endStop = stops[stops.length - 1];

            // 시간 파싱 (ISO String 가정)
            const startTime = new Date(startStop.rawArrivalTime || new Date());
            const endTime = new Date(endStop.rawArrivalTime || new Date());
            
            // 중간 지점 계산 (경로 데이터가 있으면 경로상의 중간점, 없으면 직선 중간점)
            let midLat = 0, midLng = 0;
            if (path && path.length > 0) {
                const midIdx = Math.floor(path.length / 2);
                midLat = path[midIdx].lat;
                midLng = path[midIdx].lng;
            } else {
                midLat = (Number(startStop.lat) + Number(endStop.lat)) / 2;
                midLng = (Number(startStop.lng) + Number(endStop.lng)) / 2;
            }
            
            // 중간 지점 예상 통과 시간 (총 소요 시간의 절반 시점)
            const midTime = new Date(startTime.getTime() + (summary.totalDuration * 1000) / 2);

            const points = [
                { lat: Number(startStop.lat), lng: Number(startStop.lng), time: startTime.toISOString() },
                { lat: midLat, lng: midLng, time: midTime.toISOString() },
                { lat: Number(endStop.lat), lng: Number(endStop.lng), time: endTime.toISOString() }
            ];

            // 서버리스 API 호출
            const res = await fetch('/api/weather', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points })
            });

            if (res.ok) {
                const data = await res.json();
                setWeatherBriefing(data.briefing);
                setIsWeatherWarning(data.isWarning);
            } else {
                console.error("Weather API responded with status:", res.status);
            }
        } catch (error) {
            console.error("Weather fetch failed:", error);
        } finally {
            setIsWeatherLoading(false);
        }
    };

    fetchWeather();
  }, [result]); // result 객체가 변경되면 재실행
  
  if (stops.length === 0) return null;

  // 헬퍼 함수들
  const formatDistance = (meters: number) => {
    if (!meters || isNaN(meters)) return '0 m';
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds === undefined || isNaN(seconds)) return '0분';
    if (seconds === 0) return '0분';
    if (seconds < 60) return '1분 미만';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    return `${minutes}분`;
  };
  
  const formatMoney = (amount?: number) => {
      if (!amount) return '0원';
      return `${Math.round(amount).toLocaleString()}원`;
  };

  const calculateFuelCost = () => {
      // 사용자 설정 연비 모드
      if (fuelMode === 'CUSTOM') {
          const distanceKm = summary.totalDistance / 1000;
          const pricePerLiter = fuelType === 'GASOLINE' ? oilPrices.GASOLINE : oilPrices.DIESEL;
          if (fuelEfficiency > 0) {
            return (distanceKm / fuelEfficiency) * pricePerLiter;
          }
          return 0;
      }

      // TMAP 데이터 모드 (API가 제공하는 연료비 사용)
      if (summary.fares && summary.fares.fuel > 0) {
          return summary.fares.fuel;
      }
      
      // TMAP 데이터가 없을 경우 평균 연비로 추정
      const distanceKm = summary.totalDistance / 1000;
      const avgEfficiency = fuelType === 'GASOLINE' ? 11.5 : 13.5;
      const pricePerLiter = fuelType === 'GASOLINE' ? oilPrices.GASOLINE : oilPrices.DIESEL;
      
      return (distanceKm / avgEfficiency) * pricePerLiter;
  };

  const estimatedFuelCost = calculateFuelCost();

  return (
    <div className="space-y-6">
      
      {/* 1. 운행 요약 카드 */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl shadow-blue-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
            <Clock size={100} />
        </div>
        <div className="relative z-10">
            <h2 className="text-lg font-bold opacity-90 mb-2 flex items-center gap-2">
            <Route size={20} />
            운행 요약
            </h2>
            
            {targetDateTime && (
                 <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm font-bold mb-4 shadow-sm border border-white/10">
                    <Target size={14} className="text-blue-200" />
                    <span className="text-blue-100 mr-1">예측 기준:</span>
                    <span className="text-white">{targetDateTime}</span>
                 </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 border-t border-white/10 pt-4">
                <div>
                    <div className="text-blue-100 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Timer size={12} /> 총 소요 시간
                    </div>
                    <div className="text-2xl font-bold tracking-tight">
                    {formatDuration(summary.totalDuration)}
                    </div>
                </div>
                <div>
                    <div className="text-blue-100 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Navigation size={12} /> 총 이동 거리
                    </div>
                    <div className="text-2xl font-bold tracking-tight">
                    {formatDistance(summary.totalDistance)}
                    </div>
                </div>
                <div>
                        <div className="text-blue-100 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Coins size={12} /> 예상 통행료
                        </div>
                        <div className="text-2xl font-bold tracking-tight">
                        {formatMoney(summary.fares?.toll)}
                        </div>
                </div>
                <div>
                        <div className="text-blue-100 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Fuel size={12} /> 예상 연료비
                        <span className="ml-1 text-[8px] opacity-70 border border-white/30 px-1 rounded">
                            {fuelType === 'GASOLINE' ? '휘발유' : '경유'}
                        </span>
                        </div>
                        <div className="text-2xl font-bold tracking-tight">
                        {formatMoney(estimatedFuelCost)}
                        </div>
                        <div className="text-[10px] text-blue-200 font-medium mt-1 flex items-center gap-1">
                            <Info size={10} />
                            {fuelMode === 'TMAP' 
                                ? 'TMAP 데이터 기준' 
                                : `내 연비 ${fuelEfficiency}km/L 기준`}
                        </div>
                </div>
            </div>
        </div>
      </div>

      {/* 2. AI 기상 브리핑 카드 (중간 배치) */}
      <div className={`rounded-2xl p-4 border transition-all shadow-sm flex items-center gap-4 ${
          isWeatherWarning 
            ? 'bg-amber-50 border-amber-200' 
            : 'bg-indigo-50 border-indigo-100'
      }`}>
        <div className={`p-3 rounded-full flex-shrink-0 ${
            isWeatherWarning ? 'bg-amber-100 text-amber-600' : 'bg-white text-indigo-500 shadow-sm'
        }`}>
            {isWeatherLoading ? (
                <Loader2 size={24} className="animate-spin" />
            ) : isWeatherWarning ? (
                <CloudRain size={24} />
            ) : (
                <CloudSun size={24} />
            )}
        </div>
        <div>
            <h3 className={`text-xs font-black uppercase tracking-wider mb-1 ${
                isWeatherWarning ? 'text-amber-600' : 'text-indigo-400'
            }`}>
                날씨 브리핑(기상청 제공)
            </h3>
            <p className={`text-sm font-bold leading-tight ${
                isWeatherWarning ? 'text-amber-900' : 'text-indigo-900'
            }`}>
                {isWeatherLoading ? "경로상의 날씨를 분석하고 있습니다..." : (weatherBriefing || "날씨 정보를 가져올 수 없습니다.")}
            </p>
        </div>
      </div>

      {/* 3. 상세 일정 리스트 */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Clock className="text-blue-600" />
          상세 일정
        </h2>

        <div className="relative pb-2">
          {/* 타임라인 수직선 */}
          <div className="absolute left-6 top-4 bottom-8 w-0.5 bg-gray-100 border-l-2 border-dashed border-gray-200" />

          <div className="space-y-0">
            {stops.map((stop, index) => {
              let Icon = MapPin;
              let bgClass = "bg-blue-100 text-blue-600";
              let label = `경유지 ${stop.sequence}`;
              const isStart = stop.type === 'Start';
              const isEnd = stop.type === 'End';

              if (isStart) {
                Icon = Navigation;
                bgClass = "bg-green-100 text-green-700";
                label = "출발";
              } else if (isEnd) {
                Icon = Flag;
                bgClass = "bg-red-100 text-red-700";
                label = "도착";
              }

              return (
                <div key={stop.id || index}>
                  {/* 이동 거리/시간 표시 (출발지가 아닐 때) */}
                  {index > 0 && stop.durationFromPrevious !== undefined && (
                    <div className="ml-12 mb-2 flex items-center animate-fadeIn">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                         <MoveDown size={12} />
                         <span>
                             이동 약 {formatDistance(stop.distanceFromPrevious || 0)} 
                             <span className="mx-1 text-slate-300">|</span> 
                             {formatDuration(stop.durationFromPrevious)}
                         </span>
                      </div>
                    </div>
                  )}

                  <div className="relative flex items-center gap-4 group mb-6 last:mb-0">
                    {/* 아이콘 원 */}
                    <div className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-full ${bgClass} flex items-center justify-center border-4 border-white shadow-sm ring-1 ring-gray-100`}>
                      <Icon size={20} />
                    </div>
                    
                    {/* 카드 내용 */}
                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all gap-3">
                      <div className="flex-1 min-w-0 pr-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wider block mb-0.5 ${isStart ? 'text-green-600' : isEnd ? 'text-red-500' : 'text-gray-400'}`}>
                          {label}
                        </span>
                        <h3 className="text-base font-bold text-gray-900 leading-tight truncate">
                          {stop.name}
                        </h3>
                        {stop.stayTime && stop.stayTime > 0 ? (
                            <div className="flex items-center gap-1 mt-1 text-xs font-bold text-indigo-500">
                                <Hourglass size={12} />
                                {stop.stayTime}분 체류
                            </div>
                        ) : null}
                      </div>
                      
                      {/* 시간 정보 */}
                      <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border shadow-sm w-full sm:w-auto justify-center ${isStart || isEnd ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-100 text-slate-800'}`}>
                              <Clock size={14} className={isStart || isEnd ? "text-slate-300" : "text-slate-400"} />
                              <span className="text-sm font-bold font-mono">
                                {stop.arrivalTime} {stop.type !== 'Start' && '도착'}
                              </span>
                          </div>
                          {stop.departureTime && (
                              <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-slate-400">
                                  <span>{stop.departureTime} 출발</span>
                              </div>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 하단 주의사항 */}
        <div className="mt-6 p-4 bg-amber-50/50 border border-amber-100 rounded-2xl flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
                <p className="text-xs font-bold text-amber-900">안내: 운행 시간 정보</p>
                <p className="text-[11px] leading-relaxed text-amber-800/80">
                본 서비스의 일정은 <strong>TMAP 미래 교통 예측 모델</strong>을 기반으로 산출되었습니다. 
                실제 도로 상황, 기상 변화, 갑작스러운 사고 등에 따라 예측 시간과 실제 도착 시간은 차이가 발생할 수 있으므로 운행 참고용으로만 활용해 주시기 바랍니다.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;