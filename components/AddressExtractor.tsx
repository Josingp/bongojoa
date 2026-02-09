
import React, { useRef, useState } from 'react';
import { extractAddressesFromImage } from '../services/geminiService';
import { Camera, Image as ImageIcon, Loader2, X, CheckCircle, ChevronRight } from 'lucide-react';

interface AddressExtractorProps {
  onSelectAddress: (address: string, type: 'start' | 'end' | 'via') => void;
}

const AddressExtractor: React.FC<AddressExtractorProps> = ({ onSelectAddress }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedAddresses, setExtractedAddresses] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset previous state
    setExtractedAddresses([]);
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
            fileInputRef.current.setAttribute('capture', 'environment');
        } else {
            fileInputRef.current.removeAttribute('capture');
        }
        fileInputRef.current.click();
    }
  };

  const closePanel = () => {
    setIsOpen(false);
    setPreviewUrl(null);
    setExtractedAddresses([]);
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

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg h-[90vh] sm:h-auto rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
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
            <div className="relative aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
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
                <div className="space-y-3">
                    {error ? (
                        <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl font-medium text-center">
                            {error}
                        </div>
                    ) : (
                        <>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                인식된 주소 ({extractedAddresses.length})
                            </p>
                            <div className="space-y-2">
                                {extractedAddresses.map((addr, idx) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 hover:border-indigo-300 transition-colors group">
                                        <p className="font-bold text-slate-800 text-sm mb-3 break-keep">{addr}</p>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => { onSelectAddress(addr, 'start'); closePanel(); }}
                                                className="flex-1 py-1.5 bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 text-slate-500 text-xs font-bold rounded-lg shadow-sm transition-all"
                                            >
                                                출발지로
                                            </button>
                                            <button 
                                                onClick={() => { onSelectAddress(addr, 'via'); closePanel(); }}
                                                className="flex-1 py-1.5 bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-500 text-xs font-bold rounded-lg shadow-sm transition-all"
                                            >
                                                경유지로
                                            </button>
                                            <button 
                                                onClick={() => { onSelectAddress(addr, 'end'); closePanel(); }}
                                                className="flex-1 py-1.5 bg-white border border-slate-200 hover:border-rose-500 hover:text-rose-600 text-slate-500 text-xs font-bold rounded-lg shadow-sm transition-all"
                                            >
                                                도착지로
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
        
        {/* Footer actions */}
        {!isProcessing && (
             <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                 <button 
                    onClick={() => triggerFileInput('camera')}
                    className="w-full py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                 >
                    <Camera size={18} /> 다시 찍기
                 </button>
             </div>
        )}
      </div>
    </div>
  );
};

export default AddressExtractor;
