import React, { useState, useRef, useEffect } from 'react';
import { Location, PoiItem } from '../types';
import { MapPin, X, Search, Loader2, Pin, Locate } from 'lucide-react';
import { PRESET_LOCATIONS } from '../constants';
import { searchPois, getAddressFromCoords } from '../services/tmapService';

interface InputSectionProps {
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
  label,
  location,
  onChange,
  onRemove,
  isRemovable,
  colorClass,
  placeholder,
  apiKey
}) => {
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
      alert("API Key가 설정되지 않았습니다. 우측 상단 열쇠 아이콘을 눌러 키를 확인해주세요.");
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

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("이 브라우저에서는 위치 정보를 지원하지 않습니다.");
      return;
    }
    
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        // Fetch human readable address
        const address = await getAddressFromCoords(apiKey, latitude, longitude);
        
        onChange({
          ...location,
          name: address || "내 현재 위치",
          lat: latitude.toString(),
          lng: longitude.toString()
        });
        setIsLocating(false);
      },
      (error) => {
        console.error(error);
        alert("위치 정보를 가져올 수 없습니다. 권한을 확인해주세요.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  return (
    <div 
      ref={wrapperRef}
      className={`p-4 rounded-xl border ${colorClass} bg-white shadow-sm transition-all duration-200 hover:shadow-md mb-3 ${location.isFixedFirst ? 'ring-2 ring-indigo-500 bg-indigo-50' : ''}`}
    >
      <div className="flex justify-between items-center mb-3">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
          <MapPin size={14} />
          {label}
          {location.isFixedFirst && (
            <span className="ml-2 px-2 py-0.5 bg-indigo-600 text-white text-[10px] rounded-full">1순위 고정</span>
          )}
        </label>
        
        <div className="flex items-center gap-1">
          {isRemovable && (
            <button
              onClick={toggleFixedFirst}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${location.isFixedFirst ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:bg-gray-100'}`}
              title="이곳을 가장 먼저 방문합니다"
            >
              <Pin size={14} className={location.isFixedFirst ? "fill-current" : ""} />
              {location.isFixedFirst ? "1순위" : "순서 고정"}
            </button>
          )}

          {isRemovable && onRemove && (
            <button 
              onClick={onRemove}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      
      {/* Search Bar */}
      <div className="relative mb-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if(results.length > 0) setShowResults(true);
            }}
            placeholder={placeholder || "장소 검색 (예: 서울역)"}
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCurrentLocation}
            disabled={isLocating}
            className="px-3 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center justify-center"
            title="현재 위치로 설정"
          >
             {isLocating ? <Loader2 size={16} className="animate-spin" /> : <Locate size={16} />}
          </button>
          <button
            type="submit"
            disabled={isSearching}
            className="px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          </button>
        </form>

        {/* Search Results Dropdown */}
        {showResults && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-100 z-20 max-h-60 overflow-y-auto">
            <ul className="divide-y divide-gray-100">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleSelectPoi(item)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex flex-col"
                  >
                    <span className="font-medium text-sm text-slate-800">{item.name}</span>
                    <span className="text-xs text-gray-400 mt-0.5">
                      {item.upperAddrName} {item.middleAddrName} {item.lowerAddrName} {item.detailAddrName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {showResults && !isSearching && results.length === 0 && searchQuery && (
           <div className="absolute top-full left-0 right-0 mt-1 bg-white p-3 rounded-lg shadow-xl border border-gray-100 z-20 text-sm text-gray-400 text-center">
             검색 결과가 없습니다.
           </div>
        )}
      </div>

      {/* Manual Input Fields (Details) */}
      <div className="space-y-3 pt-2 border-t border-gray-50">
        <div>
          <label className="text-[10px] uppercase text-gray-400 font-bold mb-1 block">장소명</label>
          <input
            type="text"
            value={location.name}
            onChange={(e) => onChange({ ...location, name: e.target.value })}
            placeholder="장소 이름"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Demo Presets Fallback */}
        <select 
          className="w-full text-xs text-gray-400 border-none bg-transparent focus:ring-0 cursor-pointer text-right mt-1"
          onChange={handlePresetChange}
          defaultValue=""
        >
          <option value="" disabled>빠른 선택 (Presets)</option>
          {PRESET_LOCATIONS.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default InputSection;