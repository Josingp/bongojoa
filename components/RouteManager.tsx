
import React, { useState, useEffect } from 'react';
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
          className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all font-bold