
import React from 'react';
import { OptimizedStop, OptimizationResult } from '../types';
import { Clock, Navigation, MapPin, Flag, Timer, Route, MoveDown, CalendarDays, Target, Coins, Fuel, CarTaxiFront, Hourglass } from 'lucide-react';

interface TimelineProps {
  result: OptimizationResult;
}

const Timeline: React.FC<TimelineProps> = ({ result }) => {
  const { stops, summary, targetDateTime } = result;
  
  if (stops.length === 0) return null;

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
      return `${amount.toLocaleString()}원`;
  };

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
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
                {/* 비용 정보 */}
                {summary.fares && (
                    <>
                        <div>
                             <div className="text-blue-100 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Coins size={12} /> 예상 통행료
                             </div>
                             <div className="text-2xl font-bold tracking-tight">
                                {formatMoney(summary.fares.toll)}
                             </div>
                        </div>
                        <div>
                             <div className="text-blue-100 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Fuel size={12} /> 예상 연료비
                             </div>
                             <div className="text-2xl font-bold tracking-tight">
                                {formatMoney(summary.fares.fuel)}
                             </div>
                        </div>
                    </>
                )}
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
      </div>
    </div>
  );
};

export default Timeline;
