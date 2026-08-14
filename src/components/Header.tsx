import React from 'react';
import { 
  BarChart3, 
  Database, 
  Download, 
  FileSpreadsheet, 
  Plus, 
  RotateCcw, 
  Settings, 
  Sparkles, 
  UploadCloud 
} from 'lucide-react';
import { PLATFORMS } from '../data/initialData';
import { PlatformType } from '../types';

interface HeaderProps {
  currentTab: 'dashboard' | PlatformType | 'cost_master';
  onSelectTab: (tab: 'dashboard' | PlatformType | 'cost_master') => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  availableDates: string[];
  onOpenUpload: () => void;
  onOpenSettings: () => void;
  onExportExcel: () => void;
  onResetSampleData: () => void;
  unmatchedCostCount: number;
  totalOrdersCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  selectedDate,
  onSelectDate,
  availableDates,
  onOpenUpload,
  onOpenSettings,
  onExportExcel,
  onResetSampleData,
  unmatchedCostCount,
  totalOrdersCount,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner / Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-sm shadow-indigo-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-lg text-slate-900 tracking-tight">
                  쇼핑몰 멀티채널 일일 매출 및 순이익 정산 관리기
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Sparkles className="w-3 h-3 mr-1 text-emerald-600" />
                  스마트 자동 정산
                </span>
              </div>
              <p className="text-xs text-slate-500">
                원가 자동 매칭 · 7대 플랫폼 수수료 · 합배송 배송비 정산 · 부가세 & 종합소득세(10%) 계산
              </p>
            </div>
          </div>

          {/* Global Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              id="btn-upload-excel"
              onClick={onOpenUpload}
              className="inline-flex items-center px-3.5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
            >
              <UploadCloud className="w-4 h-4 mr-1.5" />
              엑셀 업로드
            </button>

            <button
              id="btn-export-excel"
              onClick={onExportExcel}
              className="inline-flex items-center px-3.5 py-2 rounded-lg text-sm font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 mr-1.5 text-slate-600" />
              정산 엑셀 다운로드
            </button>

            <button
              id="btn-cost-master-top"
              onClick={() => onSelectTab('cost_master')}
              className={`inline-flex items-center px-3.5 py-2 rounded-lg text-sm font-medium border shadow-xs transition-colors cursor-pointer relative ${
                currentTab === 'cost_master'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Database className="w-4 h-4 mr-1.5 text-indigo-500" />
              원가 관리표
              {unmatchedCostCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 text-xs font-bold rounded-full bg-rose-500 text-white animate-pulse">
                  {unmatchedCostCount}건 미등록
                </span>
              )}
            </button>

            <button
              id="btn-settings"
              onClick={onOpenSettings}
              title="정산 및 세금 설정"
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              id="btn-reset-sample"
              onClick={onResetSampleData}
              title="샘플 데이터 복원 (사용자 사진 예시 08/12, 08/13)"
              className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Date Filter & Tab Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-2.5 border-t border-slate-100">
          {/* Main Navigation Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none py-1">
            <button
              id="tab-dashboard"
              onClick={() => onSelectTab('dashboard')}
              className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'dashboard'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
              전체 일일 통합 집계
            </button>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {/* Individual Platform Tabs */}
            {Object.values(PLATFORMS).map((p) => {
              const isActive = currentTab === p.id;
              return (
                <button
                  key={p.id}
                  id={`tab-${p.id}`}
                  onClick={() => onSelectTab(p.id)}
                  className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? `${p.bgColor} ${p.textColor} border ${p.borderColor} shadow-xs font-bold`
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full mr-1.5 ${isActive ? 'bg-current' : 'bg-slate-300'}`} />
                  {p.shortName}
                </button>
              );
            })}
          </div>

          {/* Date Selector Filter */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-medium">조회 일자:</span>
            <select
              id="select-order-date"
              value={selectedDate}
              onChange={(e) => onSelectDate(e.target.value)}
              className="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium cursor-pointer"
            >
              <option value="all">전체 일자 통합 (총 {totalOrdersCount}건)</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};
