import React from 'react';
import { OptimizedStop, OptimizationResult } from '../types';
import { Clock, Navigation, MapPin, Flag, Timer, Route, ChevronsDown } from 'lucide-react';

interface TimelineProps {
  result: OptimizationResult;
}

const Timeline: React.FC<TimelineProps> = ({ result }) => {
  const { stops, summary } = result;
  
  if (stops.length === 0) return null;

  // Format Helpers
  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    return `${minutes}분`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl shadow-blue-200">
        <h2 className="text-lg font-bold opacity-90 mb-4 flex items-center gap-2">
          <Route size={20} />
          운행 요약
        </h2>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
              <Timer size={14} /> 총 소요 시간
            </div>
            <div className="text-3xl font-bold">
              {formatDuration(summary.totalDuration)}
            </div>
          </div>
          <div>
            <div className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
              <Navigation size={14} /> 총 이동 거리
            </div>
            <div className="text-3xl font-bold">
              {formatDistance(summary.totalDistance)}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Clock className="text-blue-600" />
          상세 일정
        </h2>

        <div className="relative">
          {/* Vertical Line */}
          <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-gray-200 border-l-2 border-dashed border-gray-300" />

          <div className="space-y-0">
            {stops.map((stop, index) => {
              let Icon = MapPin;
              let bgClass = "bg-blue-100 text-blue-600";
              let label = `경유지 #${index}`;

              if (stop.type === 'Start') {
                Icon = Navigation;
                bgClass = "bg-green-100 text-green-700";
                label = "출발";
              } else if (stop.type === 'End') {
                Icon = Flag;
                bgClass = "bg-red-100 text-red-700";
                label = "도착";
              }

              return (
                <div key={stop.id || index}>
                  {/* Segment Duration Badge (Between stops) */}
                  {index > 0 && stop.durationFromPrevious !== undefined && (
                    <div className="ml-12 mb-4 flex items-center">
                      <div className="bg-gray-100 text-gray-500 text-xs font-medium px-2 py-1 rounded-md flex items-center gap-1 border border-gray-200">
                         <ChevronsDown size={12} />
                         이동: 약 {formatDuration(stop.durationFromPrevious)}
                      </div>
                    </div>
                  )}

                  <div className="relative flex items-start gap-4 group mb-8 last:mb-0">
                    <div className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-full ${bgClass} flex items-center justify-center border-4 border-white shadow-sm`}>
                      <Icon size={20} />
                    </div>
                    
                    <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100 hover:border-blue-200 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">
                            {label}
                          </span>
                          <h3 className="text-lg font-semibold text-gray-900 leading-tight">
                            {stop.name}
                          </h3>
                        </div>
                        <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <Clock size={14} className="text-gray-500" />
                                <span className="text-sm font-bold font-mono text-gray-700">
                                {stop.arrivalTime}
                                </span>
                            </div>
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