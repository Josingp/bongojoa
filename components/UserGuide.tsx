
import React from 'react';
import { X, MapPin, Sparkles, Clock, Shuffle, Coins, HelpCircle } from 'lucide-react';

interface UserGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const UserGuide: React.FC<UserGuideProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all scale-100 animate-in zoom-in-95 duration-200 relative scroll-smooth">
        
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 p-6 flex justify-between items-center z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <HelpCircle size={24} />
            </div>
            <div>
                <h2 className="text-xl font-black text-slate-900">이용 가이드</h2>
                <p className="text-xs text-slate-500 font-bold">봉고조아 최적 경로 솔루션 사용법</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          
          {/* Section 1: Basic Route */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <MapPin size={18} />
              </span>
              기본 경로 설정
            </h3>
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 leading-relaxed space-y-2 border border-slate-100">
              <p>
                <span className="font-bold text-slate-900">출발지</span>와 <span className="font-bold text-slate-900">도착지</span>를 입력하세요. 
                중간에 들러야 할 곳이 있다면 <span className="font-bold text-blue-600">경유지 추가</span> 버튼을 눌러 최대 10개까지 추가할 수 있습니다.
              </p>
              <p className="text-xs text-slate-400 font-medium">
                💡 장소 검색창에 상호명이나 주소를 입력하면 TMAP 데이터 기반으로 자동 검색됩니다.
              </p>
            </div>
          </section>

          {/* Section 2: AI Address Extraction */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Sparkles size={18} />
              </span>
              AI 주소 추출 (촬영/업로드)
            </h3>
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 leading-relaxed border border-slate-100">
              <p>
                배차표나 주소가 적힌 문서를 <span className="font-bold text-slate-900">카메라로 찍거나 이미지를 업로드</span>해보세요. 
                AI가 문서 내의 주소를 자동으로 인식하여 목록을 만들어줍니다. 인식된 주소를 탭하여 출발/도착/경유지로 손쉽게 할당할 수 있습니다.
              </p>
            </div>
          </section>

          {/* Section 3: Time Machine */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                <Clock size={18} />
              </span>
              타임머신 설정 (예측 운행)
            </h3>
            <ul className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-2 border border-slate-100">
              <li className="flex gap-2">
                <span className="font-bold text-blue-600 min-w-[65px] flex-shrink-0">출발 기준</span>
                <span>설정한 시간에 출발했을 때, 각 지점에 언제 도착하는지 TMAP 빅데이터를 기반으로 예측합니다.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-red-600 min-w-[65px] flex-shrink-0">도착 기준</span>
                <span>설정한 시간에 목적지에 도착하려면 언제 출발해야 하는지 역산하여 알려줍니다.</span>
              </li>
            </ul>
          </section>

          {/* Section 4: Optimization */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <span className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                <Shuffle size={18} />
              </span>
              경유지 순서 최적화
            </h3>
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 leading-relaxed border border-slate-100">
              <p>
                경유지가 여러 곳일 때 <span className="font-bold text-slate-900">경유지 순서 최적화</span> 체크박스를 켜세요. 
                이동 거리와 시간을 최소화하는 가장 효율적인 방문 순서를 자동으로 계산하여 재배치합니다. (3곳 이상 경유 시 효과적인데 하루사용량 제한있어요 ㅠㅠ)
              </p>
            </div>
          </section>

           {/* Section 5: Fuel Cost */}
           <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Coins size={18} />
              </span>
              유류비 계산
            </h3>
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 leading-relaxed border border-slate-100">
              <p>
                <span className="font-bold text-slate-900">설정</span> 버튼을 눌러 내 차량의 연비를 직접 입력하거나, 
                TMAP 데이터 기반의 예상 유류비를 확인할 수 있습니다. 한국석유공사(Opinet)의 실시간 전국 평균 유가를 반영하여 비용을 산출합니다.
              </p>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4 z-10">
          <button 
            onClick={onClose}
            className="w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg active:scale-[0.98]"
          >
            확인했습니다
          </button>
        </div>

      </div>
    </div>
  );
};

export default UserGuide;
