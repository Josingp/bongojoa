
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Location, OptimizationResult } from './types';
import { DEFAULT_START_LOCATION, DEFAULT_END_LOCATION, TMAP_APP_KEY } from './constants';
import { optimizeRoute } from './services/tmapService';
import InputSection from './components/InputSection';
import Timeline from './components/Timeline';
import RouteMap from './components/RouteMap';
import { Plus, RotateCcw, Clock, Map as MapIcon, AlertCircle } from 'lucide-react';

function App() {
  const [startLocation, setStartLocation] = useState<Location>(DEFAULT_START_LOCATION);
  const [endLocation, setEndLocation] = useState<Location>(DEFAULT_END_LOCATION);
  const [viaPoints, setViaPoints] = useState<Location[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });
  const [timeMode, setTimeMode] = useState<'departure' | 'arrival'>('departure');

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOptimization = async () => {
    if (!TMAP_APP_KEY) {
      setError("API 키가 설정되지 않았습니다. VITE_TMAP_APP_KEY 환경 변수를 확인하세요.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const dateObj = new Date(`${selectedDate}T${selectedTime}:00`);
      const optimizedResult = await optimizeRoute(TMAP_APP_KEY, startLocation, endLocation, viaPoints, dateObj, timeMode);
      setResult(optimizedResult);
    } catch (err: any) {
      const msg = err.message || "통신 오류";
      setError(msg);
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
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-200">T</div>
            <h1 className="text-xl font-black tracking-tight text-slate-800 uppercase">Smart Route</h1>
          </div>
          <button onClick={handleReset} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all border border-transparent hover:border-slate-200">
            <RotateCcw size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock size={16} /> 운행 스케줄
            </h2>
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1 mb-4">
              <button onClick={() => setTimeMode('departure')} className={`py-2.5 text-xs font-bold rounded-lg transition-all ${timeMode === 'departure' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>출발 기준</button>
              <button onClick={() => setTimeMode('arrival')} className={`py-2.5 text-xs font-bold rounded-lg transition-all ${timeMode === 'arrival' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400'}`}>도착 희망</button>
            </div>
            <div className="flex gap-3">
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </section>

          <section className="space-y-4">
            <InputSection label="START" location={startLocation} onChange={setStartLocation} colorClass="border-green-400" apiKey={TMAP_APP_KEY} placeholder="출발지 입력" />
            {viaPoints.map((point, idx) => (
              <InputSection key={point.id} label={`WAYPOINT ${idx + 1}`} location={point} onChange={(u) => {const n=[...viaPoints]; n[idx]=u; setViaPoints(n);}} onRemove={() => setViaPoints(viaPoints.filter((_, i) => i !== idx))} isRemovable colorClass="border-blue-400" apiKey={TMAP_APP_KEY} placeholder="경유지 입력" />
            ))}
            <button onClick={() => setViaPoints([...viaPoints, { id: uuidv4(), name: '', lat: '', lng: '', isFixedFirst: false }])} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm font-bold hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
              <Plus size={18} /> 경유지 추가
            </button>
            <InputSection label="END" location={endLocation} onChange={setEndLocation} colorClass="border-red-400" apiKey={TMAP_APP_KEY} placeholder="도착지 입력" />
          </section>

          <button onClick={handleOptimization} disabled={isLoading} className={`w-full py-5 rounded-2xl text-white font-black text-lg shadow-xl shadow-blue-100 transition-all active:scale-[0.98] ${isLoading ? 'bg-slate-300' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'}`}>
            {isLoading ? '분석 중...' : '최적 경로 탐색 시작'}
          </button>
          
          {error && (
            <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100 flex items-start gap-3 animate-shake">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0"/> 
              <div>
                <p className="font-bold">탐색 오류</p>
                <p className="opacity-80 break-all">{error}</p>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="sticky top-24 space-y-6">
            {result ? (
              <RouteMap result={result} apiKey={TMAP_APP_KEY} />
            ) : (
              <div className="w-full h-[500px] bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 shadow-inner">
                 <MapIcon size={64} className="text-slate-100 mb-4" />
                 <p className="text-lg font-black text-slate-400">경로 결과가 여기에 표시됩니다</p>
              </div>
            )}
            
            {result && <Timeline result={result} />}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
