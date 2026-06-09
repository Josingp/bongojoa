
import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Location, OptimizationResult, FuelType } from './types';
import { DEFAULT_START_LOCATION, DEFAULT_END_LOCATION, API_BASE, OPINET_ENDPOINT } from './constants';
import { optimizeRoute, searchPois } from './services/tmapService';
import { supabase } from './services/supabase';
import InputSection from './components/InputSection';
import Timeline from './components/Timeline';
import RouteMap from './components/RouteMap';
import AddressExtractor, { Assignment } from './components/AddressExtractor';
import UserGuide from './components/UserGuide';
import RouteManager from './components/RouteManager';
import GoogleAd from './components/GoogleAd';
import {
  Plus, RotateCcw, Clock, Map as MapIcon, AlertCircle, Sparkles, Loader2,
  Shuffle, ArrowUpDown, Droplets, Settings, X, Calculator, HelpCircle, CircleDollarSign,
  Save, Navigation, Zap, BarChart2, Route, Truck, CheckCircle2, MapPin
} from 'lucide-react';

import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

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
      time: `${hour}:${minute}`,
      fullDate: kst
  };
};

interface UserPlace {
    id: string;
    name: string;
    lat: string;
    lng: string;
}

function App() {
  const [startLocation, setStartLocation] = useState<Location>(DEFAULT_START_LOCATION);
  const [endLocation, setEndLocation] = useState<Location>(DEFAULT_END_LOCATION);
  const [viaPoints, setViaPoints] = useState<Location[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<string>(() => getKoreaTimeValues().date);
  const [selectedTime, setSelectedTime] = useState<string>(() => getKoreaTimeValues().time);
  const [timeMode, setTimeMode] = useState<'departure' | 'arrival'>('departure');
  
  // Settings
  const [fuelType, setFuelType] = useState<FuelType>('GASOLINE');
  const [useOptimization, setUseOptimization] = useState(false);

  // [추가] 연비 계산 관련 상태
  const [fuelMode, setFuelMode] = useState<'TMAP' | 'CUSTOM'>('TMAP');
  const [fuelEfficiency, setFuelEfficiency] = useState<number>(10.0); // km/L
  const [isFuelPopupOpen, setIsFuelPopupOpen] = useState(false);
  const [tempEfficiency, setTempEfficiency] = useState<string>("10.0");

  // [추가] 유가 정보 상태관리 (기본값 설정)
  const [oilPrices, setOilPrices] = useState({
    GASOLINE: 1642, // 기본값
    DIESEL: 1485    // 기본값
  });
  const [isPriceLoading, setIsPriceLoading] = useState(false);

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User Guide Modal State
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // User Places
  const [userId, setUserId] = useState<string | null>(null);
  const [userPlaces, setUserPlaces] = useState<UserPlace[]>([]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const currentKst = getKoreaTimeValues();
  const minDate = currentKst.date;
  const minTime = selectedDate === minDate ? currentKst.time : undefined;

  // 1. Auth & Fetch Places Logic
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (userId) {
      fetchUserPlaces(userId);
    } else {
      setUserPlaces([]);
    }
  }, [userId]);

  const fetchUserPlaces = async (uid: string) => {
      try {
          const res = await fetch(`${API_BASE}/places?userId=${uid}`);
          if (res.ok) {
              const data = await res.json();
              setUserPlaces(data);
          }
      } catch (e) {
          console.error("Failed to fetch user places", e);
      }
  };

  const handleSavePlace = async (name: string, lat: string, lng: string) => {
      if (!userId) {
          alert("로그인이 필요한 기능입니다.");
          return;
      }
      try {
          const res = await fetch(`${API_BASE}/places`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, name, lat, lng })
          });
          if (res.ok) {
              alert("장소가 저장되었습니다.");
              fetchUserPlaces(userId);
          } else {
              alert("저장에 실패했습니다.");
          }
      } catch (e) {
          console.error(e);
          alert("오류가 발생했습니다.");
      }
  };

  const handleDeletePlace = async (id: string) => {
      if (!userId || !confirm("저장된 장소를 삭제하시겠습니까?")) return;
      try {
          const res = await fetch(`${API_BASE}/places`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, id })
          });
          if (res.ok) {
              fetchUserPlaces(userId);
          }
      } catch (e) {
          console.error(e);
      }
  };

  const handleQuickSaveRoute = async () => {
    if (!userId) {
      alert("로그인이 필요한 기능입니다. 상단의 로그인 버튼을 이용해주세요.");
      return;
    }
    const defaultName = `${startLocation.name} -> ${endLocation.name}`;
    const name = prompt("저장할 경로의 이름을 입력해주세요:", defaultName);
    
    if (!name) return;

    try {
      const res = await fetch(`${API_BASE}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          name: name,
          data: {
            start: startLocation,
            end: endLocation,
            viaPoints: viaPoints
          }
        })
      });

      if (res.ok) {
        alert("경로가 저장되었습니다. '내 경로' 메뉴에서 확인하세요.");
      } else {
        alert("저장에 실패했습니다.");
      }
    } catch (e) {
      console.error(e);
      alert("오류가 발생했습니다.");
    }
  };

  const handleTmapApp = () => {
    // TMAP URL Scheme
    const params = [
      `goalname=${encodeURIComponent(endLocation.name)}`,
      `goalx=${endLocation.lng}`,
      `goaly=${endLocation.lat}`,
      `startname=${encodeURIComponent(startLocation.name)}`,
      `startx=${startLocation.lng}`,
      `starty=${startLocation.lat}`
    ];

    viaPoints.forEach((via, i) => {
      const idx = i + 1;
      params.push(`via${idx}name=${encodeURIComponent(via.name)}`);
      params.push(`via${idx}x=${via.lng}`);
      params.push(`via${idx}y=${via.lat}`);
    });

    const url = `tmap://route?${params.join('&')}`;
    
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobile) {
      alert("TMAP 앱 실행은 모바일 기기에서만 가능합니다.");
      return;
    }
    
    window.location.href = url;
  };


  // [추가] 오피넷 API 호출 로직
  useEffect(() => {
    const fetchOilPrices = async () => {
      setIsPriceLoading(true);
      try {
        const response = await fetch(`${API_BASE}${OPINET_ENDPOINT}`);
        
        if (!response.ok) {
           throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data && data.RESULT && data.RESULT.OIL) {
          const gasoline = data.RESULT.OIL.find((o: any) => o.PRODCD === 'B027')?.PRICE; // 휘발유
          const diesel = data.RESULT.OIL.find((o: any) => o.PRODCD === 'D047')?.PRICE;   // 경유
          
          if (gasoline && diesel) {
            setOilPrices({
              GASOLINE: Math.round(Number(gasoline)),
              DIESEL: Math.round(Number(diesel))
            });
          }
        }
      } catch (e) {
        console.warn("오피넷 API 호출 실패 (CORS 또는 네트워크 문제). 기본값을 사용합니다.", e);
      } finally {
        setIsPriceLoading(false);
      }
    };

    fetchOilPrices();
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      setViaPoints((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setUseOptimization(false);
    }
  };

  const handleSwap = () => {
      const temp = { ...startLocation, id: endLocation.id };
      setStartLocation({ ...endLocation, id: startLocation.id });
      setEndLocation({ ...startLocation, id: endLocation.id });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDate = e.target.value;
      if (newDate < minDate) {
          alert("과거 날짜는 선택할 수 없습니다.");
          setSelectedDate(minDate);
          return;
      }
      setSelectedDate(newDate);

      if (newDate === minDate) {
          const nowTime = getKoreaTimeValues().time;
          if (selectedTime < nowTime) {
              setSelectedTime(nowTime);
          }
      }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTime = e.target.value;
      if (selectedDate === minDate) {
          const nowTime = getKoreaTimeValues().time;
          if (newTime < nowTime) {
              alert("현재 시간보다 이전 시간은 선택할 수 없습니다.");
              setSelectedTime(nowTime);
              return;
          }
      }
      setSelectedTime(newTime);
  };

  const handleOptimization = async () => {
    const inputDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
    const now = new Date();
    if (inputDateTime.getTime() < now.getTime() - 60000) {
        setError("출발/도착 예정 시간은 과거로 설정할 수 없습니다.");
        const kst = getKoreaTimeValues();
        setSelectedDate(kst.date);
        setSelectedTime(kst.time);
        return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const optimizedResult = await optimizeRoute(
        startLocation, 
        endLocation, 
        viaPoints, 
        inputDateTime, 
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
      setFuelType('GASOLINE');
      setFuelMode('TMAP');
      
      const kst = getKoreaTimeValues();
      setSelectedDate(kst.date);
      setSelectedTime(kst.time);
    }
  };

  const handleAddressAssignments = async (assignments: Assignment[]) => {
    setIsLoading(true);
    let newStart: Location | null = null;
    let newEnd: Location | null = null;
    const newViaPoints: Location[] = [];
    const failedAddresses: string[] = [];

    try {
        await Promise.all(assignments.map(async ({ address, type }) => {
             try {
                const pois = await searchPois(address);
                if (pois.length > 0) {
                    const bestMatch = pois[0];
                    const loc: Location = {
                        id: type === 'via' ? uuidv4() : (type === 'start' ? 'start' : 'end'),
                        name: bestMatch.name,
                        lat: bestMatch.noorLat,
                        lng: bestMatch.noorLon,
                        isFixedFirst: false,
                        stayTime: 0
                    };
                    if (type === 'start') newStart = loc;
                    else if (type === 'end') newEnd = loc;
                    else newViaPoints.push(loc);
                } else {
                    failedAddresses.push(address);
                }
             } catch (err) {
                 failedAddresses.push(address);
             }
        }));

        if (newStart) setStartLocation(newStart);
        if (newEnd) setEndLocation(newEnd);
        if (newViaPoints.length > 0) {
            setViaPoints(prev => [...prev, ...newViaPoints].slice(0, 10));
        }

        if (failedAddresses.length > 0) {
            alert(`다음 주소의 위치를 찾을 수 없습니다:\n${failedAddresses.join('\n')}\n\n정확한 주소나 장소명으로 다시 시도해주세요.`);
        }

    } catch (e) {
        console.error(e);
        alert("주소 처리 중 오류가 발생했습니다.");
    } finally {
        setIsLoading(false);
    }
  };

  const saveFuelSettings = () => {
      const val = parseFloat(tempEfficiency);
      if (!isNaN(val) && val > 0) {
          setFuelEfficiency(val);
          setIsFuelPopupOpen(false);
      } else {
          alert("올바른 연비 값을 입력해주세요.");
      }
  };

  const handleLoadRoute = (data: any) => {
      if (data.start) setStartLocation(data.start);
      if (data.end) setEndLocation(data.end);
      if (data.viaPoints) setViaPoints(data.viaPoints);
      setResult(null); 
  };

  const currentRouteData = {
      start: startLocation,
      end: endLocation,
      viaPoints: viaPoints
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20 selection:bg-blue-100 relative">
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
            <RouteManager 
                currentRouteData={currentRouteData} 
                onLoadRoute={handleLoadRoute} 
            />
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <a 
              href="https://litt.ly/bongojoa" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all font-bold text-xs group"
              title="후원하기"
            >
                <CircleDollarSign size={18} className="group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">후원하기</span>
            </a>
            <button 
                onClick={() => setIsGuideOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all font-bold text-xs group"
                title="이용 가이드 보기"
            >
                <HelpCircle size={18} className="group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">이용안내</span>
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <button onClick={handleReset} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all" title="초기화">
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock size={16} className="text-blue-500" /> 타임머신 설정 (예측 운행)
            </h2>
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1 mb-4">
              <button onClick={() => setTimeMode('departure')} className={`py-2 text-xs font-black rounded-lg transition-all ${timeMode === 'departure' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>출발 시간 기준</button>
              <button onClick={() => setTimeMode('arrival')} className={`py-2 text-xs font-black rounded-lg transition-all ${timeMode === 'arrival' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>도착 희망 기준</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 px-1">날짜 (오늘 이후)</label>
                <input 
                    type="date" 
                    min={minDate}
                    value={selectedDate} 
                    onChange={handleDateChange} 
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 px-1">시간</label>
                <input 
                    type="time" 
                    min={minTime}
                    value={selectedTime} 
                    onChange={handleTimeChange} 
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
                />
              </div>
            </div>

             <div className="space-y-3 pt-4 border-t border-slate-100">
                 <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                        예상 유류비 설정
                        {fuelMode === 'CUSTOM' && <span className="text-indigo-600 bg-indigo-50 px-1.5 rounded-md">내 연비 적용중</span>}
                    </label>
                    <button 
                        onClick={() => {
                            setTempEfficiency(String(fuelEfficiency));
                            setIsFuelPopupOpen(true);
                        }}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition-colors flex items-center gap-1"
                        title="연비 및 계산 방식 설정"
                    >
                        <Settings size={14} />
                        <span className="text-[10px] font-bold">설정</span>
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-2">
                     <button
                        onClick={() => setFuelType('GASOLINE')}
                        className={`relative py-3 px-3 rounded-xl text-xs font-bold border transition-all ${fuelType === 'GASOLINE' ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                     >
                         <div className="flex items-center justify-center gap-2">
                           <span>휘발유</span>
                           {isPriceLoading ? (
                             <Loader2 size={10} className="animate-spin text-slate-400" />
                           ) : (
                             <span className={`text-[10px] font-medium ${fuelType === 'GASOLINE' ? 'text-slate-300' : 'text-slate-400'}`}>
                               {oilPrices.GASOLINE.toLocaleString()}원
                             </span>
                           )}
                         </div>
                     </button>
                     <button
                        onClick={() => setFuelType('DIESEL')}
                        className={`relative py-3 px-3 rounded-xl text-xs font-bold border transition-all ${fuelType === 'DIESEL' ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                     >
                         <div className="flex items-center justify-center gap-2">
                           <span>경유</span>
                           {isPriceLoading ? (
                             <Loader2 size={10} className="animate-spin text-slate-400" />
                           ) : (
                             <span className={`text-[10px] font-medium ${fuelType === 'DIESEL' ? 'text-slate-300' : 'text-slate-400'}`}>
                               {oilPrices.DIESEL.toLocaleString()}원
                             </span>
                           )}
                         </div>
                     </button>
                 </div>
                 
                 <div className="flex items-center justify-center gap-3 text-[10px] text-slate-400 pt-1">
                    <p className="flex items-center gap-1"><Droplets size={10} /> Opinet 실시간 평균가</p>
                    <div className="w-px h-3 bg-slate-300"></div>
                    <p className="flex items-center gap-1"><Calculator size={10} /> {fuelMode === 'TMAP' ? 'TMAP 데이터 기준' : `내 연비(${fuelEfficiency}km/L) 기준`}</p>
                 </div>
             </div>
          </section>

          <section className="space-y-3">
            <AddressExtractor onApplyAssignments={handleAddressAssignments} />
            <div className="border-t border-slate-100 my-4" />
            
            <InputSection 
                label="출발지" 
                location={startLocation} 
                onChange={setStartLocation} 
                colorClass="border-emerald-200" 
                userPlaces={userPlaces}
                onSavePlace={handleSavePlace}
                onDeletePlace={handleDeletePlace}
            />
            
            <div className="flex justify-center -my-1 relative z-10">
                <button 
                    onClick={handleSwap}
                    className="p-2 bg-white border border-slate-200 rounded-full shadow-sm text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-all hover:rotate-180 duration-300"
                    title="출발지/도착지 맞바꾸기"
                >
                    <ArrowUpDown size={18} />
                </button>
            </div>

            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={viaPoints.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {viaPoints.map((point, idx) => (
                    <InputSection 
                      key={point.id} 
                      id={point.id}
                      label={`경유지 ${idx + 1}`} 
                      location={point} 
                      onChange={(u) => {const n=[...viaPoints]; n[idx]=u; setViaPoints(n);}} 
                      onRemove={() => setViaPoints(viaPoints.filter((_, i) => i !== idx))} 
                      isRemovable 
                      colorClass="border-blue-100" 
                      userPlaces={userPlaces}
                      onSavePlace={handleSavePlace}
                      onDeletePlace={handleDeletePlace}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <button 
              onClick={() => setViaPoints([...viaPoints, { id: uuidv4(), name: '', lat: '', lng: '', isFixedFirst: false, stayTime: 0 }])} 
              className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm font-bold hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 group"
            >
              <Plus size={18} className="group-hover:scale-110 transition-transform" /> 
              경유지 추가 (최대 10개)
            </button>

            <InputSection 
                label="도착지" 
                location={endLocation} 
                onChange={setEndLocation} 
                colorClass="border-rose-200"
                userPlaces={userPlaces}
                onSavePlace={handleSavePlace}
                onDeletePlace={handleDeletePlace}
            />
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
                <RouteMap result={result} />
              </div>
            ) : (
              <div className="space-y-6">
                {/* 서비스 소개 */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl shadow-blue-500/20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                      <Route size={24} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black tracking-tight">봉고조아</h2>
                      <p className="text-blue-200 text-sm font-medium">스마트 다중 경유지 최적 경로 솔루션</p>
                    </div>
                  </div>
                  <p className="text-blue-100 text-sm leading-relaxed">
                    택배·배달·영업 방문 등 여러 곳을 방문해야 할 때, <strong className="text-white">TMAP 교통 예측 데이터</strong>를 기반으로
                    가장 빠르고 효율적인 경로를 자동으로 계산해 드립니다.
                    실시간 혼잡도와 예상 유류비까지 한눈에 확인하세요.
                  </p>
                </div>

                {/* 주요 기능 4가지 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center mb-3">
                      <Zap size={20} />
                    </div>
                    <h3 className="font-black text-slate-800 text-sm mb-1">실시간 교통 예측</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      TMAP 미래 교통 예측 모델로 출발/도착 시간대의 혼잡도를 반영한 정확한 소요 시간을 계산합니다.
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="w-10 h-10 bg-green-50 text-green-500 rounded-xl flex items-center justify-center mb-3">
                      <Shuffle size={20} />
                    </div>
                    <h3 className="font-black text-slate-800 text-sm mb-1">경유지 순서 최적화</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      최대 10개의 경유지를 입력하면 AI가 가장 빠른 방문 순서를 자동으로 재배치합니다.
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center mb-3">
                      <Droplets size={20} />
                    </div>
                    <h3 className="font-black text-slate-800 text-sm mb-1">유류비 자동 계산</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      오피넷 실시간 유가 기준으로 예상 연료비를 계산합니다. 내 차량 연비를 직접 입력할 수도 있습니다.
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="w-10 h-10 bg-purple-50 text-purple-500 rounded-xl flex items-center justify-center mb-3">
                      <BarChart2 size={20} />
                    </div>
                    <h3 className="font-black text-slate-800 text-sm mb-1">혼잡도 구간 시각화</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      원활·서행·지체·정체 4단계 색상으로 구간별 교통 상황을 지도에서 직관적으로 확인합니다.
                    </p>
                  </div>
                </div>

                {/* 이런 분들께 추천 */}
                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                  <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-blue-500" /> 이런 분들께 추천합니다
                  </h3>
                  <ul className="space-y-3">
                    {[
                      { icon: <Truck size={14} />, text: "택배·배달 기사 — 하루 배송 코스를 최단 동선으로 정리" },
                      { icon: <MapPin size={14} />, text: "영업·방문 직군 — 거래처 방문 순서를 자동으로 최적화" },
                      { icon: <MapIcon size={14} />, text: "드라이브 여행 — 여러 관광지를 시간 순서에 맞게 계획" },
                    ].map(({ icon, text }, i) => (
                      <li key={i} className="flex items-start gap-3 text-xs text-slate-600">
                        <span className="mt-0.5 text-blue-400 flex-shrink-0">{icon}</span>
                        <span className="leading-relaxed">{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 사용 방법 */}
                <div className="bg-slate-900 rounded-2xl p-6 text-white">
                  <h3 className="font-black text-sm mb-4">사용 방법</h3>
                  <ol className="space-y-3">
                    {[
                      "왼쪽에서 출발지·경유지·도착지를 입력하세요",
                      "날짜와 시간을 설정하세요 (출발 or 도착 기준 선택 가능)",
                      "경유지가 3개 이상이면 '순서 최적화'를 켜보세요",
                      "'경로 탐색' 버튼을 누르면 지도와 타임라인이 표시됩니다",
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-3 text-xs text-slate-300">
                        <span className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center font-black text-white flex-shrink-0 text-[10px]">{i + 1}</span>
                        <span className="leading-relaxed mt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
            
            {result && (
              <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                <Timeline 
                  result={result} 
                  fuelType={fuelType} 
                  oilPrices={oilPrices} 
                  fuelMode={fuelMode} 
                  fuelEfficiency={fuelEfficiency}
                />

                <div className="grid grid-cols-2 gap-3 mt-6">
                  <button
                    onClick={handleQuickSaveRoute}
                    className="py-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 shadow-sm hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Save size={20} /> 현재 경로 저장
                  </button>
                  <button
                    onClick={handleTmapApp}
                    className="py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold shadow-md hover:shadow-lg hover:from-green-600 hover:to-emerald-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Navigation size={20} /> TMAP 앱 실행
                  </button>
                </div>

                {/* 광고 2: 결과 하단 */}
                <div className="mt-6 rounded-2xl overflow-hidden border border-slate-100">
                  <GoogleAd slot="여기에_광고슬롯ID_입력" format="auto" />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      
      <footer className="bg-white border-t border-slate-100 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* FAQ */}
          <div className="mb-10">
            <h2 className="text-base font-black text-slate-800 mb-6">자주 묻는 질문</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  q: "경유지는 몇 개까지 입력할 수 있나요?",
                  a: "최대 10개까지 입력할 수 있습니다. TMAP API 제한으로 인해 경유지가 많을 경우 내부적으로 구간을 나누어 처리합니다."
                },
                {
                  q: "순서 최적화는 어떻게 작동하나요?",
                  a: "TMAP 다중 경유지 최적화 API를 활용해 실제 도로 소요 시간 기준으로 가장 빠른 방문 순서를 계산합니다. 경유지가 3개 이상일 때 효과적입니다."
                },
                {
                  q: "출발 시간 기준과 도착 희망 기준의 차이는 무엇인가요?",
                  a: "'출발 시간 기준'은 입력한 시간에 출발했을 때의 경로를 계산하고, '도착 희망 기준'은 목적지에 해당 시간까지 도착하려면 언제 출발해야 하는지를 역산합니다."
                },
                {
                  q: "유류비는 어떻게 계산되나요?",
                  a: "오피넷(한국석유공사) API에서 실시간 전국 평균 유가를 가져와 TMAP 예상 연료 소모량과 곱하거나, 직접 입력한 연비(km/L)로 계산합니다."
                },
                {
                  q: "TMAP 앱 실행은 PC에서도 되나요?",
                  a: "TMAP 앱 실행은 Android·iOS 모바일 기기에서만 가능합니다. PC에서는 경로 탐색 결과 확인 후 모바일에서 앱을 열어주세요."
                },
                {
                  q: "경로 저장 기능을 사용하려면 어떻게 하나요?",
                  a: "상단 '내 경로' 버튼을 통해 로그인하면 자주 사용하는 경로와 장소를 저장하고 빠르게 불러올 수 있습니다."
                },
              ].map(({ q, a }, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-4">
                  <p className="font-bold text-slate-800 text-xs mb-1.5">{q}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 데이터 출처 */}
          <div className="border-t border-slate-100 pt-8 mb-8">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">데이터 제공</h3>
            <div className="flex flex-wrap gap-6 text-xs text-slate-400">
              <span><strong className="text-slate-600">경로·교통 예측</strong> — SK텔레콤 TMAP API</span>
              <span><strong className="text-slate-600">유가 정보</strong> — 한국석유공사 오피넷(Opinet)</span>
              <span><strong className="text-slate-600">AI 경로 요약</strong> — Google Gemini</span>
              <span><strong className="text-slate-600">사용자 데이터</strong> — Supabase (암호화 저장)</span>
            </div>
            <p className="text-[10px] text-slate-300 mt-3 leading-relaxed">
              본 서비스의 경로·시간 정보는 TMAP 예측 모델을 기반으로 하며 실제 상황과 다를 수 있습니다.
              교통 상황, 날씨, 돌발 사고 등에 따라 달라질 수 있으므로 참고 목적으로만 사용하시기 바랍니다.
            </p>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-300">
            <p>© {new Date().getFullYear()} 봉고조아. All rights reserved.</p>
            <p className="font-bold uppercase tracking-widest">Powered by TMAP API</p>
          </div>
        </div>
      </footer>

      {/* Fuel Settings Modal */}
      {isFuelPopupOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 transform transition-all scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Settings size={20} className="text-slate-900" />
                        유류비 계산 설정
                    </h3>
                    <button onClick={() => setIsFuelPopupOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="space-y-6">
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase">계산 기준 선택</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setFuelMode('TMAP')}
                                className={`py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all ${fuelMode === 'TMAP' 
                                    ? 'border-blue-600 bg-blue-50 text-blue-700' 
                                    : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                            >
                                TMAP 데이터
                                <span className="block text-[10px] font-medium opacity-70 mt-0.5">지도 정보 기반</span>
                            </button>
                            <button
                                onClick={() => setFuelMode('CUSTOM')}
                                className={`py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all ${fuelMode === 'CUSTOM' 
                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                                    : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                            >
                                내 연비 계산
                                <span className="block text-[10px] font-medium opacity-70 mt-0.5">거리 ÷ 연비 × 유가</span>
                            </button>
                        </div>
                    </div>

                    <div className={`space-y-2 transition-opacity duration-300 ${fuelMode === 'CUSTOM' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                         <label className="text-xs font-bold text-slate-400 uppercase">내 차량 연비 (km/L)</label>
                         <div className="relative">
                             <input 
                                type="number" 
                                value={tempEfficiency}
                                onChange={(e) => setTempEfficiency(e.target.value)}
                                placeholder="예: 12.5"
                                step="0.1"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-right pr-12"
                             />
                             <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">km/L</span>
                         </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button 
                            onClick={() => setIsFuelPopupOpen(false)}
                            className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            취소
                        </button>
                        <button 
                            onClick={saveFuelSettings}
                            className="flex-[2] py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                        >
                            설정 적용하기
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* User Guide Modal */}
      <UserGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

    </div>
  );
}

export default App;
