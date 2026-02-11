
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../services/supabase';
import { User } from '@supabase/supabase-js';
import { FolderHeart, Save, LogOut, MessageCircle, Trash2, X, Loader2, Route } from 'lucide-react';
import { API_BASE } from '../constants';
import { Location } from '../types';

interface RouteManagerProps {
  currentRouteData?: {
    start: Location;
    end: Location;
    viaPoints: Location[];
  };
  onLoadRoute: (data: any) => void;
}

interface SavedRoute {
  id: string;
  name: string; // Changed from route_name to match DB
  data: any;    // Changed from route_data to match DB
  created_at: string;
}

const RouteManager: React.FC<RouteManagerProps> = ({ currentRouteData, onLoadRoute }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'save'>('list');
  const [routeName, setRouteName] = useState('');
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: 'https://www.bongojoa.com',
        scopes: 'profile_nickname profile_image',
        queryParams: {
            scope: 'profile_nickname profile_image'
        }
      },
    });
    if (error) alert('로그인 실패: ' + error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsModalOpen(false);
  };

  const fetchRoutes = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/routes?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setSavedRoutes(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveRoute = async () => {
    if (!user || !currentRouteData || !routeName.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          name: routeName,
          data: currentRouteData
        })
      });
      
      if (res.ok) {
        alert('경로가 저장되었습니다.');
        setRouteName('');
        setActiveTab('list');
        fetchRoutes();
      } else {
        alert('저장에 실패했습니다.');
      }
    } catch (error) {
      console.error(error);
      alert('오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRoute = async (id: string) => {
      if (!user || !confirm('정말 삭제하시겠습니까?')) return;
      try {
          const res = await fetch(`${API_BASE}/routes`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  userId: user.id,
                  id: id
              })
          });
          if (res.ok) {
              setSavedRoutes(prev => prev.filter(r => r.id !== id));
          }
      } catch (error) {
          console.error(error);
      }
  };

  const openModal = (tab: 'list' | 'save') => {
    if (!user) {
      handleLogin();
      return;
    }
    setActiveTab(tab);
    setIsModalOpen(true);
    if (tab === 'list') {
        fetchRoutes();
    }
  };

  if (!user) {
    return (
      <button
        onClick={handleLogin}
        className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-yellow-900 hover:bg-yellow-50 rounded-lg transition-all font-bold text-xs"
        title="카카오 로그인"
      >
        <MessageCircle size={18} className="text-yellow-400 fill-current" />
        <span className="hidden sm:inline">로그인</span>
      </button>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => openModal('list')}
          className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all font-bold text-xs"
          title="내 경로 목록"
        >
          <FolderHeart size={18} />
          <span className="hidden sm:inline">내 경로</span>
        </button>
      </div>

      {isModalOpen && createPortal(
        <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={(e) => { if(e.target === e.currentTarget) setIsModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] supports-[height:100dvh]:max-h-[80dvh] overflow-hidden flex flex-col relative m-auto" onClick={(e) => e.stopPropagation()}>
            
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white flex-shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <FolderHeart size={20} className="text-indigo-600" />
                나의 경로 관리
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                <X size={20} />
              </button>
            </div>

            <div className="flex border-b border-slate-100 flex-shrink-0">
                <button 
                    onClick={() => { setActiveTab('list'); fetchRoutes(); }}
                    className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'list' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    저장된 경로
                </button>
                <button 
                    onClick={() => setActiveTab('save')}
                    className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'save' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    현재 경로 저장
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                {activeTab === 'list' ? (
                    isLoading ? (
                        <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-indigo-400" /></div>
                    ) : savedRoutes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-4">
                            <div className="text-slate-400 text-sm font-medium">
                                저장된 경로가 없습니다.
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors"
                            >
                                닫기
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {savedRoutes.map(route => (
                                <div key={route.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-all group">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-slate-800">{route.name}</h4>
                                        <button onClick={() => deleteRoute(route.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <div className="text-xs text-slate-500 mb-3 space-y-1">
                                        <p className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> {route.data.start.name}</p>
                                        {route.data.viaPoints?.length > 0 && (
                                            <p className="flex items-center gap-1 pl-2.5 border-l-2 border-slate-100 ml-0.5 my-1">
                                                <span className="text-slate-400">... 경유 {route.data.viaPoints.length}곳 ...</span>
                                            </p>
                                        )}
                                        <p className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> {route.data.end.name}</p>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                                        <span className="text-[10px] text-slate-300">
                                            {new Date(route.created_at).toLocaleDateString()}
                                        </span>
                                        <button 
                                            onClick={() => {
                                                onLoadRoute(route.data);
                                                setIsModalOpen(false);
                                                alert(`'${route.name}' 경로를 불러왔습니다.`);
                                            }}
                                            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors"
                                        >
                                            불러오기
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    <div className="space-y-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">경로 이름</label>
                            <input 
                                type="text" 
                                value={routeName}
                                onChange={(e) => setRouteName(e.target.value)}
                                placeholder="예: 매주 월요일 배송 코스"
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </div>
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-xs text-blue-700 font-medium">
                            <p className="flex items-center gap-2 font-bold mb-1"><Route size={14} /> 현재 설정 저장</p>
                            출발지: {currentRouteData?.start.name}<br/>
                            도착지: {currentRouteData?.end.name}<br/>
                            경유지: {currentRouteData?.viaPoints.length}곳
                        </div>
                        <button 
                            onClick={saveRoute}
                            disabled={!routeName.trim() || isLoading}
                            className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-200"
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin mx-auto" /> : '저장하기'}
                        </button>
                    </div>
                )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-2">
                    <img src={user.user_metadata.avatar_url || "https://via.placeholder.com/32"} alt="User" className="w-8 h-8 rounded-full border border-white shadow-sm" />
                    <span className="text-xs font-bold text-slate-600 truncate max-w-[120px]">{user.user_metadata.full_name || user.email}</span>
                </div>
                <button onClick={handleLogout} className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-rose-500">
                    <LogOut size={14} /> 로그아웃
                </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default RouteManager;
