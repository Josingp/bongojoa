
import React, { useRef, useState } from 'react';
import { extractAddressesFromFiles, FileInput, ExtractedAddress } from '../services/geminiService';
import { Camera, Image as ImageIcon, Loader2, X, CheckCircle, Check, FileText, Upload, Plus, Sparkles, AlertCircle } from 'lucide-react';

export interface Assignment {
    address: string;
    type: 'start' | 'end' | 'via';
}

interface AddressExtractorProps {
  onApplyAssignments: (assignments: Assignment[]) => void;
}

type AssignmentType = 'start' | 'end' | 'via';

interface ProcessedFile {
    id: string; // Unique ID for UI handling
    url: string; // Blob URL for preview
    type: 'image' | 'pdf';
    name: string;
}

// ----------------------------------------------------------------------
// ⚡️ 파일 크기 제한 설정
// ----------------------------------------------------------------------
const MAX_PDF_SIZE_MB = 2; // 개별 PDF 파일 제한
const MAX_TOTAL_PAYLOAD_MB = 3; // 전체 전송 데이터 제한 (Vercel Limit 고려)

// ----------------------------------------------------------------------
// ⚡️ 이미지 압축 유틸리티 함수
// ----------------------------------------------------------------------
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const maxWidth = 1024; 
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};
// ----------------------------------------------------------------------

const AddressExtractor: React.FC<AddressExtractorProps> = ({ onApplyAssignments }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedAddress[]>([]);
  const [assignments, setAssignments] = useState<Record<string, AssignmentType>>({});
  
  // State for batch processing
  const [previewFiles, setPreviewFiles] = useState<ProcessedFile[]>([]);
  const [filesToSend, setFilesToSend] = useState<FileInput[]>([]); // Base64 data to send
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Handle File Selection (Accumulate files with Compression)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;

      const newFiles = Array.from(e.target.files);
      
      // [보안] 1차 검증: PDF 용량 제한
      for (const file of newFiles) {
          if (file.type === 'application/pdf' && file.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
              alert(`PDF 파일 '${file.name}'의 크기가 ${MAX_PDF_SIZE_MB}MB를 초과합니다.\nPDF는 압축되지 않으므로 2MB 이하의 파일만 업로드해주세요.`);
              // Reset input value to allow re-selection
              e.target.value = '';
              return;
          }
      }

      // If this is the first file, open modal immediately
      if (!isOpen) {
        setIsOpen(true);
      }
      setIsProcessing(true);
      setError(null);

      const newPreviews: ProcessedFile[] = [];
      const newPayloads: FileInput[] = [];

      try {
          const filePromises = newFiles.map(async (file) => {
             const isImage = file.type.startsWith('image/');
             
             let base64Data = "";
             if (isImage) {
                 base64Data = await compressImage(file);
             } else {
                 base64Data = await readFileAsBase64(file);
             }

             newPayloads.push({
                 base64Data,
                 mimeType: isImage ? 'image/jpeg' : file.type 
             });

             newPreviews.push({
                 id: Math.random().toString(36).substr(2, 9),
                 url: URL.createObjectURL(file),
                 type: file.type.includes('pdf') ? 'pdf' : 'image',
                 name: file.name
             });
          });

          await Promise.all(filePromises);

          // [보안] 2차 검증: 전체 페이로드 용량 제한
          const currentTotalSize = filesToSend.reduce((acc, f) => acc + f.base64Data.length, 0);
          const newTotalSize = newPayloads.reduce((acc, f) => acc + f.base64Data.length, 0);
          const totalSizeMB = (currentTotalSize + newTotalSize) / (1024 * 1024);

          if (totalSizeMB > MAX_TOTAL_PAYLOAD_MB) {
             throw new Error(`전체 업로드 용량이 ${MAX_TOTAL_PAYLOAD_MB}MB를 초과합니다.\n(현재 약 ${totalSizeMB.toFixed(1)}MB)\n파일을 줄여서 다시 시도해주세요.`);
          }

          // Append to existing state
          setPreviewFiles(prev => [...prev, ...newPreviews]);
          setFilesToSend(prev => [...prev, ...newPayloads]);
          
          if (extractedItems.length > 0) {
              setExtractedItems([]);
              setAssignments({});
          }

      } catch (err: any) {
          console.error(err);
          newPreviews.forEach(p => URL.revokeObjectURL(p.url));
          setError(err.message || "파일을 처리하는 중 오류가 발생했습니다.");
      } finally {
          setIsProcessing(false);
          // Always reset input value after processing to allow selecting same file again
          e.target.value = '';
      }
  };

  // 2. Trigger AI Analysis
  const runAnalysis = async () => {
      if (filesToSend.length === 0) return;

      setIsProcessing(true);
      setError(null);
      setExtractedItems([]);
      setAssignments({});

      try {
          const items = await extractAddressesFromFiles(filesToSend);
          
          if (items.length === 0) {
              setError("파일에서 인식된 주소가 없습니다.");
              return;
          }

          // [Auto Assignment Logic]
          const newAssignments: Record<string, AssignmentType> = {};
          let startAssigned = false;
          let endAssigned = false;

          items.forEach(item => {
              // Prioritize AI suggestions, but start/end can only be assigned once.
              if (item.role === 'start' && !startAssigned) {
                  newAssignments[item.address] = 'start';
                  startAssigned = true;
              } else if (item.role === 'end' && !endAssigned) {
                  newAssignments[item.address] = 'end';
                  endAssigned = true;
              } else if (item.role === 'via') {
                  // For 'via', we can auto-assign, or leave it for user to confirm.
                  // Let's auto-assign 'via' to help the user.
                  newAssignments[item.address] = 'via';
              }
              // 'unknown' roles are not auto-assigned.
          });

          setExtractedItems(items);
          setAssignments(newAssignments);

      } catch (err: any) {
          console.error(err);
          setError(err.message || "AI 분석 중 오류가 발생했습니다.");
      } finally {
          setIsProcessing(false);
      }
  };

  const removeFile = (index: number) => {
      const fileToRemove = previewFiles[index];
      URL.revokeObjectURL(fileToRemove.url); 

      setPreviewFiles(prev => prev.filter((_, i) => i !== index));
      setFilesToSend(prev => prev.filter((_, i) => i !== index));
      
      if (extractedItems.length > 0) {
          setExtractedItems([]);
          setAssignments({});
      }
  };

  const triggerFileInput = (mode: 'camera' | 'gallery') => {
    if (fileInputRef.current) {
        if (mode === 'camera') {
            fileInputRef.current.setAttribute('accept', 'image/*');
            fileInputRef.current.setAttribute('capture', 'environment');
            fileInputRef.current.removeAttribute('multiple');
        } else {
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
          type: type as AssignmentType
      }));
      onApplyAssignments(list);
      closePanel();
  };

  const closePanel = () => {
    setIsOpen(false);
    previewFiles.forEach(f => URL.revokeObjectURL(f.url));
    setPreviewFiles([]);
    setFilesToSend([]);
    setExtractedItems([]);
    setAssignments({});
    setError(null);
  };

  const assignedCount = Object.keys(assignments).length;
  const hasFiles = previewFiles.length > 0;
  const hasResults = extractedItems.length > 0;

  return (
    <>
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            style={{ 
                position: 'absolute', 
                width: '1px', 
                height: '1px', 
                padding: 0, 
                margin: '-1px', 
                overflow: 'hidden', 
                clip: 'rect(0,0,0,0)', 
                border: 0,
                opacity: 0,
                pointerEvents: 'none'
            }}
        />

        {!isOpen ? (
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
        ) : (
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
                        
                        {/* 1. Staging Area (Previews) */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    업로드된 파일 ({previewFiles.length})
                                </p>
                                {!isProcessing && !hasResults && (
                                    <button 
                                        onClick={() => triggerFileInput('gallery')}
                                        className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md flex items-center gap-1 hover:bg-indigo-100"
                                    >
                                        <Plus size={10} /> 추가하기
                                    </button>
                                )}
                            </div>

                            {hasFiles ? (
                                <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
                                    {previewFiles.map((file, idx) => (
                                        <div key={file.id} className="relative flex-shrink-0 w-28 aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 snap-center shadow-sm group">
                                            {file.type === 'image' ? (
                                                <img src={file.url} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-slate-400">
                                                    <FileText size={32} className="mb-1 text-rose-500" />
                                                    <span className="text-[9px] text-center font-bold line-clamp-2 w-full break-words leading-tight">{file.name}</span>
                                                    <span className="text-[8px] bg-rose-100 text-rose-600 px-1 py-0.5 rounded mt-1 font-bold">PDF</span>
                                                </div>
                                            )}
                                            <button 
                                                onClick={() => removeFile(idx)}
                                                className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-red-500 transition-colors"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    {/* Add More Button */}
                                    {!isProcessing && !hasResults && (
                                        <button 
                                            onClick={() => triggerFileInput('gallery')}
                                            className="flex-shrink-0 w-28 aspect-[3/4] bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all gap-2"
                                        >
                                            <Plus size={24} />
                                            <span className="text-xs font-bold">추가</span>
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="h-32 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                                    <ImageIcon size={32} className="opacity-50" />
                                    <span className="text-xs font-medium">배차표나 주소 이미지를 추가해주세요 (최대 3MB)</span>
                                </div>
                            )}
                        </div>

                        {/* 2. Action / Loading Area */}
                        {isProcessing ? (
                            <div className="py-8 flex flex-col items-center justify-center bg-indigo-50/50 rounded-xl border border-indigo-100 animate-pulse">
                                <Loader2 size={32} className="text-indigo-600 animate-spin mb-3" />
                                <p className="text-sm font-bold text-indigo-900">
                                    AI가 주소를 분석하고 있습니다...
                                </p>
                                <p className="text-xs text-indigo-400 mt-1">문서 내용을 바탕으로 출발/도착지를 구분합니다.</p>
                            </div>
                        ) : (
                            <>
                                {/* Analyze Button */}
                                {hasFiles && !hasResults && (
                                    <button 
                                        onClick={runAnalysis}
                                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2 font-black text-base active:scale-[0.98]"
                                    >
                                        <Sparkles size={20} className="animate-pulse" />
                                        {previewFiles.length}개 파일 분석 시작
                                    </button>
                                )}

                                {/* Error Message */}
                                {error && (
                                    <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl font-medium text-center border border-red-100 flex items-center justify-center gap-2">
                                        <AlertCircle size={18} />
                                        <span className="whitespace-pre-line">{error}</span>
                                    </div>
                                )}
                            </>
                        )}

                        {/* 3. Results Area */}
                        {hasResults && !isProcessing && (
                            <div className="space-y-3 pb-20 animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex justify-between items-end mb-2 px-1 border-t border-slate-100 pt-4">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        분석 결과 ({extractedItems.length})
                                    </p>
                                    <button 
                                        onClick={() => {
                                            setExtractedItems([]);
                                            setAssignments({});
                                        }}
                                        className="text-[10px] text-slate-400 underline hover:text-slate-600"
                                    >
                                        결과 초기화
                                    </button>
                                </div>
                                
                                <div className="space-y-2">
                                    {extractedItems.map((item, idx) => {
                                        const addr = item.address;
                                        const currentType = assignments[addr];
                                        
                                        return (
                                            <div key={idx} className={`bg-white border rounded-xl p-3 transition-all ${currentType ? 'border-indigo-500 shadow-md ring-1 ring-indigo-500/20 bg-indigo-50/30' : 'border-slate-200 hover:border-slate-300'}`}>
                                                <div className="flex justify-between items-start gap-2 mb-3">
                                                    <div className="flex-1">
                                                        <p className="font-bold text-slate-800 text-sm break-keep leading-snug">{addr}</p>
                                                        {item.role !== 'unknown' && !currentType && (
                                                             <p className="text-[10px] text-slate-400 mt-1">
                                                                AI 제안: {item.role === 'start' ? '출발지' : item.role === 'end' ? '도착지' : '경유지'}
                                                             </p>
                                                        )}
                                                    </div>
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
                            </div>
                        )}
                    </div>
                    
                    {/* Footer actions */}
                    {!isProcessing && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex gap-3">
                            <button 
                                onClick={() => {
                                    triggerFileInput('gallery');
                                }}
                                className="flex-1 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
                            >
                                <Plus size={16} /> 파일 추가
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
                                {assignedCount}개 주소 적용
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}
    </>
  );
};

export default AddressExtractor;
