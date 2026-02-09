
import React, { useState, useRef, useEffect } from 'react';
import { Location, PoiItem } from '../types';
import { MapPin, X, Search, Loader2, Pin, Locate, GripVertical, Clock } from 'lucide-react';
import { PRESET_LOCATIONS } from '../constants';
import { searchPois, getAddressFromCoords } from '../services/tmapService';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface InputSectionProps {
  id?: string; // For drag and drop
  label: string;
  location: Location;
  onChange: (loc: Location) => void;
  onRemove?: () => void;
  isRemovable?: boolean;
  colorClass: string;
  placeholder?: string;
  apiKey: string;
}

const InputSection: React.FC<InputSectionProps> = ({
  id,
  label,
  location,
  onChange,
  onRemove,
  isRemovable,
  colorClass,
  placeholder,
  apiKey
}) => {
  // Sortable hook
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: id || '' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  // Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PoiItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (!apiKey) {
      alert("지도 서비스 API 키가 설정되지 않았습니다.");
      return;
    }

    setIsSearching(true);
    setShowResults(true);
    try {
      const poiItems = await searchPois(apiKey, searchQuery);
      setResults(poiItems);
    } catch (error) {
      console.error(error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPoi = (poi: PoiItem) => {
    onChange({
      ...location,
      name: poi.name,
      lat: poi.noorLat,
      lng: poi.noorLon
    });
    setSearchQuery("");
    setShowResults(false);
    setResults([]);
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedName = e.target.value;
    const preset = PRESET_LOCATIONS.find(p => p.name === selectedName);
    if (preset) {
      onChange({ ...location, name: preset.name, lat: preset.lat, lng: preset.lng });
    }
  };

  const toggleFixedFirst = () => {
    onChange({ ...location, isFixedFirst: !location.isFixedFirst });
  };
  
  const handleStayTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      onChange({ ...location, stayTime: isNaN(val) ? 0 : val });
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("이 브라우저에서는 현재 위치 기능을 사용할 수 없습니다.");
      return;
    }
    
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const address = await getAddressFromCoords(apiKey, latitude, longitude);
          onChange({
            ...location,
            name: address || "내 현재 위치",
            lat: latitude.toString(),
            lng: longitude.toString()
          });
        } catch (err) {
          onChange({
            ...location,
            name: "현재 위치",
            lat: latitude.toString(),
            lng: longitude.toString()
          });
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        let errorMsg = "위치 정보를 가져올 수 없습니다.";
        if (error.code === error.PERMISSION_DENIED) errorMsg = "위치 정보 접근 권한이 거부되었습니다.";
        alert(errorMsg);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  return (
    <div 
      ref={setNodeRef}
      style={id ? style : undefined}
      className={`p-4 rounded-xl border ${colorClass} bg-white shadow-sm transition-all duration-200 hover:shadow-md mb-3 ${location.isFixedFirst ? 'ring-2 ring-blue-500 bg-blue-50/30' : ''}`}
    >
      <div className="flex justify-between items-center mb-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 select-none">
          {isRemovable && id ? (
              <div 
                {...attributes} 
                {...listeners} 
                className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-0.5"
              >
                  <GripVertical size={16} />
              </div>
          ) : (
             <MapPin size={14} className="text-slate-300" />
          )}
          {label}
          {location.isFixedFirst && (
            <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-[10px] rounded-full shadow-sm">우선 순위</span>
          )}
        </label>
        
        <div className="flex items-center gap-1">
          {isRemovable && (
            <button
              onClick={toggleFixedFirst}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${location.isFixedFirst ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-50'}`}
              title="가장 먼저 방문하도록 설정"
            >
              <Pin size={14} className={location.isFixedFirst ? "fill-current" : ""} />
            </button>
          )}

          {isRemovable && onRemove && (
            <button 
              onClick={onRemove}
              className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      
      <div className="relative mb-3" ref={wrapperRef}>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if(results.length > 0) setShowResults(true);
              }}
              placeholder={placeholder || "장소 검색"}
              className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
            />
            <button
              type="button"
              onClick={handleCurrentLocation}
              disabled={isLocating}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
              title="현재 위치"
            >
               {isLocating ? <Loader2 size={16} className="animate-spin text-blue-600" /> : <Locate size={18} />}
            </button>
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center"
          >
            {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          </button>
        </form>

        {showResults && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[60] max-h-64 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <ul className="divide-y divide-slate-50">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleSelectPoi(item)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex flex-col gap-0.5"
                  >
                    <span className="font-bold text-sm text-slate-800">{item.name}</span>
                    <span className="text-xs text-slate-400 truncate">
                      {item.upperAddrName} {item.middleAddrName} {item.lowerAddrName} {item.detailAddrName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-2 pt-3 border-t border-slate-50">
        <div className={isRemovable ? "col-span-8" : "col-span-12"}>
          <label className="text-[10px] uppercase text-slate-400 font-black mb-1 block tracking-tighter">확인된 장소</label>
          <input
            type="text"
            value={location.name}
            onChange={(e) => onChange({ ...location, name: e.target.value })}
            placeholder="장소 이름"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
          />
        </div>
        
        {isRemovable && (
             <div className="col-span-4">
                 <label className="text-[10px] uppercase text-slate-400 font-black mb-1 block tracking-tighter">체류(분)</label>
                 <div className="relative">
                     <input
                        type="number"
                        min="0"
                        step="5"
                        value={location.stayTime || 0}
                        onChange={handleStayTimeChange}
                        className="w-full pl-2 pr-7 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all text-right"
                     />
                     <Clock size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300" />
                 </div>
             </div>
        )}

        {/* Preset Select (Hidden in visual hierarchy but kept for utility if needed, now minimal) */}
        {!isRemovable && (
             <div className="col-span-12 flex justify-end">
                <select 
                    className="text-[10px] font-bold text-slate-400 border-none bg-transparent focus:ring-0 cursor-pointer hover:text-blue-500 transition-colors"
                    onChange={handlePresetChange}
                    value=""
                >
                    <option value="" disabled>주요 장소 퀵선택</option>
                    {PRESET_LOCATIONS.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                </select>
            </div>
        )}
      </div>
    </div>
  );
};

export default InputSection;
