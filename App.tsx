import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Location, OptimizationResult } from './types';
import { DEFAULT_START_LOCATION, DEFAULT_END_LOCATION, TMAP_APP_KEY } from './constants';
import { optimizeRoute } from './services/tmapService';
import InputSection from './components/InputSection';
import Timeline from './components/Timeline';
import RouteMap from './components/RouteMap';
import { Play, Plus, RotateCcw, Navigation, Calendar, Clock, ArrowRight } from 'lucide-react';

function App() {
  const apiKey = TMAP_APP_KEY;

  const [startLocation, setStartLocation] = useState<Location>(DEFAULT_START_LOCATION);
  const [endLocation, setEndLocation] = useState<Location>(DEFAULT_END_LOCATION);
  const [viaPoints, setViaPoints] = useState<Location[]>([]);
  
  // Date and Time State
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  });
  const [timeMode, setTimeMode] = useState<'departure' | 'arrival'>('departure');

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Effect: Force "Departure" mode if via points exist
  useEffect(() => {
    if (viaPoints.length > 0 && timeMode === 'arrival') {
      setTimeMode('departure');
    }
  }, [viaPoints, timeMode]);

  const addViaPoint = () => {
    if (viaPoints.length >= 10) {
      alert("경유지는 최대 10곳까지 설정 가능합니다.");
      return;
    }
    setViaPoints([
      ...viaPoints,
      { id: uuidv4(), name: '', lat: '', lng: '', isFixedFirst: false }
    ]);
  };

  const updateViaPoint = (index: number, updated: Location) => {
    const newPoints = [...viaPoints];
    if (updated.isFixedFirst && !viaPoints[index].isFixedFirst) {
      newPoints.forEach(p => p.isFixedFirst = false);
    }
    newPoints[index] = updated;
    setViaPoints(newPoints);
  };

  const removeViaPoint = (index: number) => {
    setViaPoints(viaPoints.filter((_, i) => i !== index));
  };

  const handleOptimization = async () => {
    if (!startLocation.lat || !startLocation.lng) {
      setError("출발지가 올바르게 설정되지 않았습니다.");
      return;
    }
    if (!endLocation.lat || !endLocation.lng) {
      setError("도착지가 올바르게 설정되지 않았습니다.");
      return;
    }
    const invalidVias = viaPoints.filter(p => !p.lat || !p.lng);
    if (invalidVias.length > 0) {
      setError("좌표가 없는 경유지가 있습니다. 장소를 검색하여 선택해주세요.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // Combine Date and Time
      const dateTimeString = `${selectedDate}T${selectedTime}:00`;
      const dateObj = new Date(dateTimeString);
      
      const optimizedResult = await optimizeRoute(apiKey, startLocation, endLocation, viaPoints, dateObj, timeMode);
      setResult(optimizedResult);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "경로 탐색에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStartLocation(DEFAULT_START_LOCATION);
    setEndLocation(DEFAULT_END_LOCATION);
    setViaPoints([]);
    setResult(null);
    setError(null);
    
    // Reset to current time
    const now = new Date();
    setSelectedDate(now.toISOString().slice(0, 10));
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    setSelectedTime(`${h}:${m}`);
    setTimeMode('departure');
  };

  // Quick Time Helpers
  const setNow = () => {
    const now = new Date();
    setSelectedDate(now.toISOString().slice(0, 10));
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    setSelectedTime(`${h}:${m}`);
  };

  const addTime = (minutes: number) => {
    const current = new Date(`${selectedDate}T${selectedTime}:00`);
    const future = new Date(current.getTime() + minutes * 60000);
    setSelectedDate(future.toISOString().slice(0, 10));
    const h = future.getHours().toString().padStart(2, '0');
    const m = future.getMinutes().toString().padStart(2, '0');
    setSelectedTime(`${h}:${m}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
              T
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              최적 경로 탐색기
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleReset}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
              title="초기화"
            >
              <RotateCcw size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Inputs */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Enhanced Time Config */}
          <div className="bg-white rounded-xl p-1 shadow-sm border border-gray-100 overflow-hidden">
            {/* Tabs */}
            <div className="grid grid-cols-2 p-1 bg-gray-50/50 rounded-lg gap-1">
              <button
                onClick={() => setTimeMode('departure')}
                className={`py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 ${
                  timeMode === 'departure' 
                    ? 'bg-white text-blue-600 shadow-sm border border-gray-200' 
                    : 'text-gray-400 hover:bg-gray-100'
                }`}
              >
                <ArrowRight size={14} /> 출발 시간
              </button>
              <button
                onClick={() => setTimeMode('arrival')}
                disabled={viaPoints.length > 0}
                className={`py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 ${
                  timeMode === 'arrival' 
                    ? 'bg-white text-red-600 shadow-sm border border-gray-200' 
                    : viaPoints.length > 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:bg-gray-100'
                }`}
              >
                <Clock size={14} /> 도착 희망
              </button>
            </div>
            
            {/* Date/Time Inputs */}
            <div className="p-4 pt-3">
              <div className="flex gap-2 mb-3">
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Calendar size={16} />
                  </div>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none"
                  />
                </div>
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Clock size={16} />
                  </div>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none"
                  />
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2">
                <button onClick={setNow} className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md transition-colors">
                  현재
                </button>
                <button onClick={() => addTime(10)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md transition-colors">
                  +10분
                </button>
                <button onClick={() => addTime(60)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md transition-colors">
                  +1시간
                </button>
                <button onClick={() => addTime(1440)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md transition-colors">
                  내일
                </button>
              </div>

              {viaPoints.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-3 text-center bg-gray-50 py-1 rounded">
                  * 경유지가 포함된 경로는 <span className="font-bold">출발 시간 기준</span>으로만 계산됩니다.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <InputSection
              label="출발지"
              location={startLocation}
              onChange={setStartLocation}
              colorClass="border-green-200"
              apiKey={apiKey}
            />

            <div className="relative">
               <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200 -z-10" />
               <div className="space-y-3 pl-0">
                  {viaPoints.map((point, idx) => (
                    <InputSection
                      key={point.id}
                      label={`경유지 ${idx + 1}`}
                      location={point}
                      onChange={(updated) => updateViaPoint(idx, updated)}
                      onRemove={() => removeViaPoint(idx)}
                      isRemovable
                      colorClass="border-blue-200"
                      placeholder="방문할 장소 검색"
                      apiKey={apiKey}
                    />
                  ))}
               </div>
            </div>

            <button
              onClick={addViaPoint}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              경유지 추가
            </button>

            <InputSection
              label="도착지"
              location={endLocation}
              onChange={setEndLocation}
              colorClass="border-red-200"
              apiKey={apiKey}
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 animate-pulse flex items-start gap-2">
               <span className="mt-0.5">⚠️</span>
               <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleOptimization}
            disabled={isLoading}
            className={`w-full py-4 rounded-xl text-white font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-3 transition-all transform active:scale-95 ${
              isLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                경로 분석 중...
              </>
            ) : (
              <>
                <Play fill="currentColor" size={20} />
                {timeMode === 'arrival' ? '출발 시간 계산하기' : '최적 경로 찾기'}
              </>
            )}
          </button>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-7 space-y-6">
          {result ? (
            <>
               <RouteMap result={result} />
               <Timeline result={result} />
            </>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-gray-400 bg-white rounded-2xl border border-gray-100 border-dashed">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Navigation size={32} className="text-gray-300" />
              </div>
              <p className="font-medium">장소를 추가하고 경로를 찾아보세요</p>
              <p className="text-sm mt-2 text-center max-w-xs">
                지도 위에서 최적 경로와 예상 시간을 확인하실 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;