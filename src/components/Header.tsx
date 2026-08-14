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
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
      {/* Top Banner / Navigation */}
      <div className="max-w-[98%] xl:max-w-[1600px] mx-auto px-3">
        <div className="flex items-center justify-between h-11">
          {/* Logo & Title */}
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h1 className="font-bold text-xs text-slate-900 tracking-tight">
                  쇼핑몰 멀티채널 일일 정산 관리기
                </h1>
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Sparkles className="w-2.5 h-2.5 mr-0.5 text-emerald-600" />
                  한눈에 보기
                </span>
              </div>
            </div>
          </div>

          {/* Global Action Buttons */}
          <div className="flex items-center space-x-1.5">
            <button
              id="btn-upload-excel"
              onClick={onOpenUpload}
              className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs transition-colors cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 mr-1" />
              엑셀 업로드
            </button>

            <button
              id="btn-export-excel"
              onClick={onExportExcel}
              className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              엑셀 다운로드
            </button>

            <button
              id="btn-cost-master-top"
              onClick={() => onSelectTab('cost_master')}
              className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border shadow-2xs transition-colors cursor-pointer relative ${
                currentTab === 'cost_master'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Database className="w-3.5 h-3.5 mr-1 text-indigo-500" />
              원가 관리표
              {unmatchedCostCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white animate-pulse">
                  {unmatchedCostCount}
                </span>
              )}
            </button>

            <button
              id="btn-settings"
              onClick={onOpenSettings}
              title="정산 및 세금 설정"
              className="p-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            <button
              id="btn-reset-sample"
              onClick={onResetSampleData}
              title="샘플 데이터 복원"
              className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Date Filter & Tab Bar */}
        <div className="flex items-center justify-between gap-2 py-0.5 border-t border-slate-100">
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
