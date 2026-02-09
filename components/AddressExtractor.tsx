
import React, { useRef, useState } from 'react';
import { extractAddressesFromFiles, FileInput } from '../services/geminiService';
import { Camera, Image as ImageIcon, Loader2, X, CheckCircle, Check, FileText, Upload, Plus } from 'lucide-react';

export interface Assignment {
    address: string;
    type: 'start' | 'end' | 'via';
}

interface AddressExtractorProps {
  onApplyAssignments: (assignments: Assignment[]) => void;
}

type AssignmentType = 'start' | 'end' | 'via';

interface ProcessedFile {
    url: string; // Blob URL for preview
    type: 'image' | 'pdf';
    name: string;
}

const AddressExtractor: React.FC<AddressExtractorProps> = ({ onApplyAssignments }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedAddresses, setExtractedAddresses] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, AssignmentType>>({});
  
  // State for multiple files
  const [previewFiles, setPreviewFiles] = useState<ProcessedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    // Reset UI State for new batch
    setExtractedAddresses([]);
    setAssignments({});
    setError(null);
    setIsProcessing(true);
    setIsOpen(true);

    const newPreviewFiles: ProcessedFile[] = [];
    const filesToSend: FileInput[] = [];

    try {
        const filePromises = Array.from(fileList).map(file => {
            return new Promise<void>((resolve, reject) => {
                // Create Preview URL
                const fileType = file.type.includes('pdf') ? 'pdf' : 'image';
                newPreviewFiles.push({
                    url: URL.createObjectURL(file),
                    type: fileType,
                    name: file.name
                });

                // Read for API (Base64)
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    // Remove "data:*/*;base64," prefix
                    const base64Data = result.split(',')[1];
                    filesToSend.push({
                        base64Data,
                        mimeType: file.type
                    });
                    resolve();
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });

        await Promise.all(filePromises);
        setPreviewFiles(newPreviewFiles);

        // Call Gemini API with all files
        const addresses = await extractAddressesFromFiles(filesToSend);
        setExtractedAddresses(addresses);
        
        if (addresses.length === 0) {
            setError("파일에서 인식된 주소가 없습니다.");
        }

    } catch (err: any) {
        console.error(err);
        setError(err.message || "파일 처리 중 오류가 발생했습니다.");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      processFiles(e.target.files);
      // Reset input value to allow selecting same file again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFileInput = (mode: 'camera' | 'gallery') => {
    if (fileInputRef.current) {
        if (mode === 'camera') {
            // Camera Mode: Image only, Capture enabled, Single file
            fileInputRef.current.setAttribute('accept', 'image/*');
            fileInputRef.current.setAttribute('capture', 'environment');
            fileInputRef.current.removeAttribute('multiple');
        } else {
            // Gallery Mode: Image & PDF, No capture, Multiple files
            fileInputRef.current.setAttribute('accept', 'image/*,application/pdf');
            fileInputRef.current.removeAttribute('capture');
            fileInputRef.current.setAttribute('multiple', 'multiple');
        }
        fileInputRef.current.click();
    }
  };

  const toggleAssignment = (address: string, type: AssignmentType) => {
    setAssignments(prev => {
        const next = { ...prev };
        if (next[address] === type) {
            delete next[address];
        } else {
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
      const list: Assignment[] = Object.entries(assignments).map(([address, type]) => ({
          address,
          type
      }));
      onApplyAssignments(list);
      closePanel();
  };

  const closePanel = () => {
    setIsOpen(false);
    // Cleanup blob URLs
    previewFiles.forEach(f => URL.revokeObjectURL(f.url));
    setPreviewFiles([]);
    setExtractedAddresses([]);
    setAssignments({});
  };

  if (!isOpen) {
    return (
        <>
            <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
            />
            <div className="grid grid-cols-2 gap-2">
                <button 
                    onClick={() => triggerFileInput('camera')}
                    className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm font-bold active:scale-95"
                >
                    <Camera size={18} /> 새로 촬영
                </button>
                <button 
                    onClick={() => triggerFileInput('gallery')}
                    className="py-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm font-bold active:scale-95"
                >
                    <Upload size={18} className="text-indigo-600" /> 갤러리 / PDF
                </button>
            </div>
        </>
    );
  }

  const assignedCount = Object.keys(assignments).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg h-[95vh] sm:h-auto sm:max-h-[85vh] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
        
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
            {/* File Previews (Carousel) */}
            <div className="relative">
                <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
                    {previewFiles.map((file, idx) => (
                        <div key={idx} className="relative flex-shrink-0 w-40 aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 snap-center shadow-sm">
                            {file.type === 'image' ? (
                                <img src={file.url} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-slate-400">
                                    <FileText size={40} className="mb-2 text-rose-500" />
                                    <span className="text-[10px] text-center font-bold line-clamp-2 w-full break-words leading-tight">{file.name}</span>
                                    <span className="text-[9px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded mt-1 font-bold">PDF</span>
                                </div>
                            )}
                        </div>
                    ))}
                    {/* Add More Placeholder (Visual only for now, functionality implies simpler re-upload) */}
                    {/* Could implement 'append' logic later if needed */}
                </div>

                {isProcessing && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl">
                        <Loader2 size={40} className="text-indigo-600 animate-spin mb-3" />
                        <p className="text-sm font-bold text-indigo-900 animate-pulse">
                            {previewFiles.length}개의 파일을 분석 중...
                        </p>
                    </div>
                )}
            </div>

            {/* Results */}
            {!isProcessing && (
                <div className="space-y-3 pb-20">
                    {error ? (
                        <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl font-medium text-center border border-red-100">
                            <p className="font-bold mb-1">오류 발생</p>
                            {error}
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-between items-end mb-2 px-1">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    인식된 주소 ({extractedAddresses.length})
                                </p>
                                <span className="text-[10px] text-slate-400">주소를 탭하여 할당하세요</span>
                            </div>
                            
                            <div className="space-y-2">
                                {extractedAddresses.map((addr, idx) => {
                                    const currentType = assignments[addr];
                                    
                                    return (
                                        <div key={idx} className={`bg-white border rounded-xl p-3 transition-all ${currentType ? 'border-indigo-500 shadow-md ring-1 ring-indigo-500/20 bg-indigo-50/30' : 'border-slate-200 hover:border-slate-300'}`}>
                                            <div className="flex justify-between items-start gap-2 mb-3">
                                                <p className="font-bold text-slate-800 text-sm break-keep flex-1 leading-snug">{addr}</p>
                                                {currentType && (
                                                    <span className={`flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tight
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
                                                            : 'bg-white border border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200'}`}
                                                >
                                                    {assignments[addr] === 'start' && <Check size={12} strokeWidth={3} />} 출발
                                                </button>
                                                <button 
                                                    onClick={() => toggleAssignment(addr, 'via')}
                                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1
                                                        ${assignments[addr] === 'via' 
                                                            ? 'bg-blue-600 text-white shadow-sm' 
                                                            : 'bg-white border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'}`}
                                                >
                                                    {assignments[addr] === 'via' && <Check size={12} strokeWidth={3} />} 경유
                                                </button>
                                                <button 
                                                    onClick={() => toggleAssignment(addr, 'end')}
                                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1
                                                        ${assignments[addr] === 'end' 
                                                            ? 'bg-rose-600 text-white shadow-sm' 
                                                            : 'bg-white border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'}`}
                                                >
                                                    {assignments[addr] === 'end' && <Check size={12} strokeWidth={3} />} 도착
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
             <div className="p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex gap-3">
                 <button 
                    onClick={() => {
                        // Re-trigger whatever mode might be most useful, or maybe just close to try again.
                        // Let's create a generic "Add/Retry" logic or just rely on closing.
                        // For UX simplicity, "Retry" will trigger gallery as it's more versatile.
                        triggerFileInput('gallery');
                    }}
                    className="flex-1 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
                 >
                    <Plus size={16} /> 추가/재선택
                 </button>
                 <button 
                    onClick={applyChanges}
                    disabled={assignedCount === 0}
                    className={`flex-[2] py-3 font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm
                        ${assignedCount > 0 
                            ? 'bg-slate-900 text-white hover:bg-slate-800' 
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                 >
                    <CheckCircle size={18} />
                    {assignedCount}개 적용
                 </button>
             </div>
        )}
      </div>
    </div>
  );
};

export default AddressExtractor;
