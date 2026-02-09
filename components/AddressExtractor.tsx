
import React, { useRef, useState } from 'react';
import { extractAddressesFromImage } from '../services/geminiService';
import { Camera, Image as ImageIcon, Loader2, X, CheckCircle, ChevronRight, Check } from 'lucide-react';

interface AddressExtractorProps {
  onSelectAddress: (address: string, type: 'start' | 'end' | 'via') => void;
}

type AssignmentType = 'start' | 'end' | 'via';

const AddressExtractor: React.FC<AddressExtractorProps> = ({ onSelectAddress }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedAddresses, setExtractedAddresses] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, AssignmentType>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset previous state
    setExtractedAddresses([]);
    setAssignments({});
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setIsProcessing(true);
    setIsOpen(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        try {
            const addresses = await extractAddressesFromImage(base64String, file.type);
            setExtractedAddresses(addresses);
            if (addresses.length === 0) {
                setError("이미지에서 인식된 주소가 없습니다.");
            }
        } catch (err: any) {
            setError(err.message || "이미지 분석 중 오류가 발생했습니다.");
        } finally {
            setIsProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("파일을 읽는 중 오류가 발생했습니다.");
      setIsProcessing(false);
    }
  };

  const triggerFileInput = (mode: 'camera' | 'gallery') => {
    if (fileInputRef.current) {
        if (mode === 'camera') {
            // capture="user" requests the front-facing camera
            fileInputRef.current.setAttribute('capture', 'user');
        } else {
            fileInputRef.current.removeAttribute('capture');
        }
        fileInputRef.current.click();
    }
  };

  const toggleAssignment = (address: string, type: AssignmentType) => {
    setAssignments(prev => {
        const next = { ...prev };
        // 이미 해당 타입으로 선택되어 있으면 해제 (Toggle off)
        if (next[address] === type) {
            delete next[address];
        } else {
            // 다른 주소에 이미 'start'나 'end'가 있다면 제거 (start, end는 유일해야 함)
            if (type === 'start' || type === 'end') {
                Object.keys(next).forEach(key => {
                    if (next[key] === type) delete next[key];
                });
            }
            next[address] = type;
        }
        return next;
    });
  };

  const applyChanges = () => {
      Object.entries(assignments).forEach(([addr, type]) => {
          onSelectAddress(addr, type);
      });
      closePanel();
  };

  const closePanel = () => {
    setIsOpen(false);
    setPreviewUrl(null);
    setExtractedAddresses([]);
    setAssignments({});
  };

  if (!isOpen) {
    return (
        <>
            <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
            />
            <div className="flex gap-2">
                <button 
                    onClick={() => triggerFileInput('camera')}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm font-bold"
                >
                    <Camera size={18} /> 사진으로 주소 인식
                </button>
            </div>
        </>
    );
  }

  const assignedCount = Object.keys(assignments).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg h-[90vh] sm:h-auto sm:max-h-[85vh] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10 flex-shrink-0">
            <h3 className="font-bold text-lg flex items-center gap-2">
                <ImageIcon size={20} className="text-indigo-600" />
                AI 주소 추출
            </h3>
            <button onClick={closePanel} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Image Preview */}
            <div className="relative aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0">
                {previewUrl && (
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                )}
                {isProcessing && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                        <Loader2 size={40} className="text-indigo-600 animate-spin mb-3" />
                        <p className="text-sm font-bold text-indigo-900 animate-pulse">AI가 주소를 분석 중입니다...</p>
                    </div>
                )}
            </div>

            {/* Results */}
            {!isProcessing && (
                <div className="space-y-3 pb-20">
                    {error ? (
                        <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl font-medium text-center">
                            {error}
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-between items-end mb-2">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    인식된 주소 ({extractedAddresses.length})
                                </p>
                                <span className="text-[10px] text-slate-400">주소를 탭하여 할당하세요</span>
                            </div>
                            
                            <div className="space-y-2">
                                {extractedAddresses.map((addr, idx) => {
                                    const currentType = assignments[addr];
                                    
                                    return (
                                        <div key={idx} className={`bg-white border rounded-xl p-3 transition-all ${currentType ? 'border-indigo-500 shadow-md ring-1 ring-indigo-500/20' : 'border-slate-200 hover:border-slate-300'}`}>
                                            <div className="flex justify-between items-start gap-2 mb-3">
                                                <p className="font-bold text-slate-800 text-sm break-keep flex-1">{addr}</p>
                                                {currentType && (
                                                    <span className={`flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full uppercase
                                                        ${currentType === 'start' ? 'bg-emerald-100 text-emerald-600' : 
                                                          currentType === 'end' ? 'bg-rose-100 text-rose-600' : 
                                                          'bg-blue-100 text-blue-600'}`}>
                                                        {currentType === 'start' ? '출발지' : currentType === 'end' ? '도착지' : '경유지'}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => toggleAssignment(addr, 'start')}
                                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1
                                                        ${assignments[addr] === 'start' 
                                                            ? 'bg-emerald-600 text-white shadow-sm' 
                                                            : 'bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'}`}
                                                >
                                                    {assignments[addr] === 'start' && <Check size={12} />} 출발
                                                </button>
                                                <button 
                                                    onClick={() => toggleAssignment(addr, 'via')}
                                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1
                                                        ${assignments[addr] === 'via' 
                                                            ? 'bg-blue-600 text-white shadow-sm' 
                                                            : 'bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600'}`}
                                                >
                                                    {assignments[addr] === 'via' && <Check size={12} />} 경유
                                                </button>
                                                <button 
                                                    onClick={() => toggleAssignment(addr, 'end')}
                                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1
                                                        ${assignments[addr] === 'end' 
                                                            ? 'bg-rose-600 text-white shadow-sm' 
                                                            : 'bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-600'}`}
                                                >
                                                    {assignments[addr] === 'end' && <Check size={12} />} 도착
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
        
        {/* Footer actions */}
        {!isProcessing && (
             <div className="p-4 border-t border-slate-100 bg-white flex-shrink-0 flex gap-3">
                 <button 
                    onClick={() => triggerFileInput('camera')}
                    className="flex-1 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                 >
                    <Camera size={18} /> 다시 찍기
                 </button>
                 <button 
                    onClick={applyChanges}
                    disabled={assignedCount === 0}
                    className={`flex-[2] py-3 font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2
                        ${assignedCount > 0 
                            ? 'bg-slate-900 text-white hover:bg-slate-800' 
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                 >
                    <CheckCircle size={18} />
                    {assignedCount}개 장소 적용하기
                 </button>
             </div>
        )}
      </div>
    </div>
  );
};

export default AddressExtractor;
