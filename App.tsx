import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Location, OptimizationResult } from './types';
import { DEFAULT_START_LOCATION, DEFAULT_END_LOCATION, TMAP_APP_KEY } from './constants';
import { optimizeRoute, searchPois } from './services/tmapService';
import InputSection from './components/InputSection';
import Timeline from './components/Timeline';
import RouteMap from './components/RouteMap';
import AddressExtractor, { Assignment } from './components/AddressExtractor';
import { Plus, RotateCcw, Clock, Map as MapIcon, AlertCircle, Sparkles, Loader2, Shuffle, Terminal } from 'lucide-react';

const getKoreaTimeValues = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const kst = new Date(utc + (9 * 60 * 60 * 1000));
  
  const year = kst.getFullYear();
  const month = String(kst.getMonth() + 1).padStart(2, '0');
  const day = String(kst.getDate()).padStart(2, '0');
  const hour = String(kst.getHours()).padStart(2, '0');
  const minute = String(kst.getMinutes()).padStart(2, '0');

  return {
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`
  };
};

function App() {
  const apiKey = TMAP_APP_KEY;

  const [startLocation, setStartLocation] = useState<Location>(DEFAULT_START_LOCATION);
  const [endLocation, setEndLocation] = useState<Location>(DEFAULT_END_LOCATION);
  const [viaPoints, setViaPoints] = useState<Location[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<string>(() => getKoreaTimeValues().date);
  const [selectedTime, setSelectedTime] = useState<string>(() => getKoreaTimeValues().time);
  const [timeMode, setTimeMode] = useState<'departure' | 'arrival'>('departure');

  const [useOptimization, setUseOptimization] = useState(false);

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOptimization = async () => {
    if (!apiKey) {
      setError("시스템 오류: TMAP API 키가 설정되지 않았습니다. 관리자에게 문의해주세요.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const dateObj = new Date(`${selectedDate}T${selectedTime}:00`);
      
      const optimizedResult = await optimizeRoute(
        apiKey, 
        startLocation, 
        endLocation, 
        viaPoints, 
        dateObj, 
        timeMode,
        useOptimization
      );
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
      setUseOptimization(false);
      
      const kst = getKoreaTimeValues();
      setSelectedDate(kst.date);
      setSelectedTime(kst.time);
    }
  };

  const handleAddressAssignments = async (assignments: Assignment[]) => {
    if (!apiKey) {
        alert("시스템 오류: TMAP API 키가 설정되지 않아 주소를 검색할 수 없습니다.");
        return;
    }

    setIsLoading(true);
    let newStart: Location | null = null;
    let newEnd: Location | null = null;
    const newViaPoints: Location[] = [];

    try {
        await Promise.all(assignments.map(async ({ address, type }) => {
             try {
                const pois = await searchPois(apiKey, address);
                if (pois.length > 0) {
                    const bestMatch = pois[0];
                    const loc: Location = {
                        id: type === 'via' ? uuidv4() : (type === 'start' ? 'start' : 'end'),
                        name: bestMatch.name,
                        lat: bestMatch.noorLat,
                        lng: bestMatch.noorLon,
                        isFixedFirst: false
                    };
                    if (type === 'start') newStart = loc;
                    else if (type === 'end') newEnd = loc;
                    else newViaPoints.push(loc);
                }
             } catch (err) {}
        }));

        if (newStart) setStartLocation(newStart);
        if (newEnd) setEndLocation(newEnd);
        if (newViaPoints.length > 0) {
            setViaPoints(prev => [...prev, ...newViaPoints].slice(0, 10));
        }
    } catch (e) {
        console.error(e);
        alert("주소 처리 중 오류가 발생했습니다.");
    } finally {
        setIsLoading(false);
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
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all">
              <RotateCcw size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          {!apiKey && (
            <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start gap-3">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-xs font-black text-red-600 uppercase mb-1">설정 오류</p>
                <p className="text-sm text-red-700 font-medium">환경 변수(VITE_TMAP_APP_KEY)가 설정되지 않았습니다.</p>
              </div>
            </div>
          )}

          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock size={16} className="text-blue-500" /> 타임머신 설정 (예측 운행)
            </h2>
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1 mb-4">
              <button onClick={() => setTimeMode('departure')} className={`py-2 text-xs font-black rounded-lg transition-all ${timeMode === 'departure' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>출발 시간 기준</button>
              <button onClick={() => setTimeMode('arrival')} className={`py-2 text-xs font-black rounded-lg transition-all ${timeMode === 'arrival' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>도착 희망 기준</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 px-1">날짜 (한국 시간)</label>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 px-1">시간</label>
                <input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <AddressExtractor onApplyAssignments={handleAddressAssignments} />
            <div className="border-t border-slate-100 my-4" />
            <InputSection label="출발지" location={startLocation} onChange={setStartLocation} colorClass="border-emerald-200" apiKey={apiKey} />
            
            <div className="space-y-3">
              {viaPoints.map((point, idx) => (
                <InputSection key={point.id} label={`경유지 ${idx + 1}`} location={point} onChange={(u) => {const n=[...viaPoints]; n[idx]=u; setViaPoints(n);}} onRemove={() => setViaPoints(viaPoints.filter((_, i) => i !== idx))} isRemovable colorClass="border-blue-100" apiKey={apiKey} />
              ))}
            </div>

            <button 
              onClick={() => setViaPoints([...viaPoints, { id: uuidv4(), name: '', lat: '', lng: '', isFixedFirst: false }])} 
              className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm font-bold hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 group"
            >
              <Plus size={18} className="group-hover:scale-110 transition-transform" /> 
              경유지 추가 (최대 10개)
            </button>

            <InputSection label="도착지" location={endLocation} onChange={setEndLocation} colorClass="border-rose-200" apiKey={apiKey} />
          </section>
          
          {viaPoints.length > 0 && (
             <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white text-indigo-600 rounded-lg shadow-sm">
                        <Shuffle size={20} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-800">경유지 순서 최적화</p>
                        <p className="text-[10px] text-slate-500 font-medium">체크 시, 가장 빠른 순서로 경유지를 재배치합니다.</p>
                        {viaPoints.length < 3 && (
                            <p className="text-[10px] text-indigo-400 mt-1 font-bold">💡 경유지가 3개 이상일 때 효과적입니다.</p>
                        )}
                    </div>
                </div>
                <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                    <input 
                        type="checkbox" 
                        name="toggle" 
                        id="optimization-toggle" 
                        checked={useOptimization}
                        onChange={(e) => setUseOptimization(e.target.checked)}
                        className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-300 ease-in-out checked:right-0 right-6 checked:border-indigo-600 border-slate-300"
                    />
                    <label 
                        htmlFor="optimization-toggle" 
                        className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer transition-colors duration-300 ${useOptimization ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    ></label>
                </div>
             </div>
          )}

          <button 
            onClick={handleOptimization} 
            disabled={isLoading} 
            className={`w-full py-5 rounded-2xl text-white font-black text-lg shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${isLoading ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 shadow-slate-200'}`}
          >
            {isLoading ? <Loader2 size={24} className="animate-spin" /> : <><Sparkles size={20} /> {useOptimization ? "최적 순서 경로 탐색" : "순차 경로 탐색"}</>}
          </button>
          
          {error && (
            <div className="p-4 bg-rose-50 text-rose-600 text-xs rounded-2xl border border-rose-100 flex items-start gap-3">
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
                <RouteMap result={result} apiKey={apiKey} />
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
                
                {/* Debug Console */}
                <div className="mt-8 bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 overflow-hidden">
                    <div className="flex items-center gap-2 mb-2 text-slate-400 font-bold uppercase tracking-wider">
                        <Terminal size={14} /> 타임머신 디버그 로그
                    </div>
                    <div className="space-y-1">
                        <div className="flex gap-2">
                            <span className="text-blue-400">[Timestamp]</span>
                            <span>{result.debug.timestamp}</span>
                        </div>
                         <div className="flex gap-2">
                            <span className="text-green-400">[Mode]</span>
                            <span>{result.debug.mode}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="text-yellow-400">[Endpoint]</span>
                            <span className="break-all">{result.debug.requestUrl}</span>
                        </div>
                        <div className="mt-2">
                            <span className="text-purple-400 block mb-1">[Payload]</span>
                            <pre className="bg-slate-800 p-2 rounded-lg overflow-x-auto text-[10px] leading-relaxed">
                                {JSON.stringify(result.debug.requestPayload, null, 2)}
                            </pre>
                        </div>
                        <div className="mt-2 text-[10px] text-slate-500">
                            * departureTime/predictionTime이 올바르게 설정되었는지 확인하세요. (예: 1535 = 오후 3:35)
                        </div>
                    </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <footer className="max-w-6xl mx-auto px-4 mt-12 text-center pb-8">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">TMAP Mobility & API Service 기반</p>
      </footer>
    </div>
  );
}

export default App;