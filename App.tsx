
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Location, OptimizationResult } from './types';
import { DEFAULT_START_LOCATION, DEFAULT_END_LOCATION, TMAP_APP_KEY } from './constants';
import { optimizeRoute } from './services/tmapService';
import InputSection from './components/InputSection';
import Timeline from './components/Timeline';
import RouteMap from './components/RouteMap';
import { Plus, RotateCcw, Clock, Map as MapIcon, AlertCircle, Sparkles, Loader2 } from 'lucide-react';

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
      setError("시스템 설정 오류: API 키를 찾을 수 없습니다. Vercel 환경 변수 설정을 확인해 주세요.");
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
      const msg = err.message || "경로 탐색 중 알 수 없는 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (confirm("모든 내용을 초기화하시겠습니까?")) {
      setStartLocation(DEFAULT_START_LOCATION);
      setEndLocation(DEFAULT_END_LOCATION);
      setViaPoints([]);
      setResult(null);
      setError(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20 selection:bg-blue-100">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/30">T</div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">봉고조아</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">최적 경로 솔루션</p>
            </div>
          </div>
          <button 
            onClick={handleReset} 
            className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
            title="초기화"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock size={16} className="text-blue-500" /> 운행 스케줄
            </h2>
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1 mb-4">
              <button onClick={() => setTimeMode('departure')} className={`py-2 text-xs font-black rounded-lg transition-all ${timeMode === 'departure' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>출발 시간 기준</button>
              <button onClick={() => setTimeMode('arrival')} className={`py-2 text-xs font-black rounded-lg transition-all ${timeMode === 'arrival' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>도착 희망 기준</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 px-1">날짜</label>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 px-1">시간</label>
                <input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <InputSection label="출발지" location={startLocation} onChange={setStartLocation} colorClass="border-emerald-200" apiKey={TMAP_APP_KEY} placeholder="출발지 검색" />
            
            <div className="space-y-3">
              {viaPoints.map((point, idx) => (
                <InputSection key={point.id} label={`경유지 ${idx + 1}`} location={point} onChange={(u) => {const n=[...viaPoints]; n[idx]=u; setViaPoints(n);}} onRemove={() => setViaPoints(viaPoints.filter((_, i) => i !== idx))} isRemovable colorClass="border-blue-100" apiKey={TMAP_APP_KEY} placeholder="경유지 검색" />
              ))}
            </div>

            <button 
              onClick={() => setViaPoints([...viaPoints, { id: uuidv4(), name: '', lat: '', lng: '', isFixedFirst: false }])} 
              className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm font-bold hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 group"
            >
              <Plus size={18} className="group-hover:scale-110 transition-transform" /> 
              경유지 추가 (최대 10개)
            </button>

            <InputSection label="도착지" location={endLocation} onChange={setEndLocation} colorClass="border-rose-200" apiKey={TMAP_APP_KEY} placeholder="도착지 검색" />
          </section>

          <button 
            onClick={handleOptimization} 
            disabled={isLoading} 
            className={`w-full py-5 rounded-2xl text-white font-black text-lg shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${isLoading ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 shadow-slate-200'}`}
          >
            {isLoading ? (
              <Loader2 size={24} className="animate-spin" />
            ) : (
              <>
                <Sparkles size={20} />
                최적 경로 탐색
              </>
            )}
          </button>
          
          {error && (
            <div className="p-4 bg-rose-50 text-rose-600 text-xs rounded-2xl border border-rose-100 flex items-start gap-3 animate-in fade-in zoom-in-95 duration-200">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0"/> 
              <div className="flex-1">
                <p className="font-black uppercase tracking-tighter mb-1">탐색 오류</p>
                <p className="font-medium opacity-90 leading-relaxed">{error}</p>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="sticky top-24 space-y-6">
            {result ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <RouteMap result={result} apiKey={TMAP_APP_KEY} />
              </div>
            ) : (
              <div className="w-full h-[500px] bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 shadow-sm">
                 <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                   <MapIcon size={32} className="text-slate-200" />
                 </div>
                 <p className="text-sm font-black text-slate-400 tracking-tight uppercase">장소를 입력하고 탐색을 시작하세요</p>
              </div>
            )}
            
            {result && (
              <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                <Timeline result={result} />
              </div>
            )}
          </div>
        </div>
      </main>
      
      <footer className="max-w-6xl mx-auto px-4 mt-12 text-center">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">TMAP Mobility & API Service 기반</p>
      </footer>
    </div>
  );
}

export default App;
