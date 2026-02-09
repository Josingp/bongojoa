
import React from 'react';
import { OptimizedStop, OptimizationResult } from '../types';
import { Clock, Navigation, MapPin, Flag, Timer, Route, MoveDown, CalendarDays } from 'lucide-react';

interface TimelineProps {
  result: OptimizationResult;
}

const Timeline: React.FC<TimelineProps> = ({ result }) => {
  const { stops, summary } = result;
  
  if (stops.length === 0) return null;

  // 포맷 헬퍼 함수
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
  
  // 날짜 표시 포맷
  const getDisplayDate = (isoString: string) => {
      const date = new Date(isoString);
      return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  };
  
  const startDate = stops.length > 0 ? getDisplayDate(stops[0].rawArrivalTime) : '';

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl shadow-blue-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
            <Clock size={100} />
        </div>
        <div className="relative z-10">
            <h2 className="text-lg font-bold opacity-90 mb-1 flex items-center gap-2">
            <Route size={20} />
            운행 요약
            </h2>
            <p className="text-blue-200 text-xs font-medium mb-4 flex items-center gap-1">
                <CalendarDays size={12} />
                {startDate} 기준 예측 경로
            </p>
            <div className="grid grid-cols-2 gap-8 border-t border-white/10 pt-4">
            <div>
                <div className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Timer size={14} /> 총 소요 시간
                </div>
                <div className="text-3xl font-bold tracking-tight">
                {formatDuration(summary.totalDuration)}
                </div>
            </div>
            <div>
                <div className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Navigation size={14} /> 총 이동 거리
                </div>
                <div className="text-3xl font-bold tracking-tight">
                {formatDistance(summary.totalDistance)}
                </div>
            </div>
            </div>
        </div>
      </div>

      {/* 타임라인 */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Clock className="text-blue-600" />
          상세 일정
        </h2>

        <div className="relative pb-2">
          {/* 수직선 */}
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
                  {index > 0 && stop.durationFromPrevious !== undefined && (
                    <div className="ml-12 mb-2 flex items-center animate-fadeIn">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                         <MoveDown size={12} />
                         <span>이동 약 {formatDuration(stop.durationFromPrevious)}</span>
                      </div>
                    </div>
                  )}

                  <div className="relative flex items-center gap-4 group mb-6 last:mb-0">
                    <div className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-full ${bgClass} flex items-center justify-center border-4 border-white shadow-sm ring-1 ring-gray-100`}>
                      <Icon size={20} />
                    </div>
                    
                    <div className="flex-1 flex items-center justify-between bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all">
                      <div className="flex-1 min-w-0 pr-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wider block mb-0.5 ${isStart ? 'text-green-600' : isEnd ? 'text-red-500' : 'text-gray-400'}`}>
                          {label}
                        </span>
                        <h3 className="text-base font-bold text-gray-900 leading-tight truncate">
                          {stop.name}
                        </h3>
                      </div>
                      
                      <div className="flex-shrink-0 flex items-center gap-2">
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border shadow-sm ${isStart || isEnd ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-100 text-slate-800'}`}>
                              <Clock size={14} className={isStart || isEnd ? "text-slate-300" : "text-slate-400"} />
                              <span className="text-sm font-bold font-mono">
                                {stop.arrivalTime}
                              </span>
                          </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
