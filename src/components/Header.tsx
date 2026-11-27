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


// Read-only export: never writes, deletes, migrates, or recalculates application data.
const BACKUP_STORAGE_KEYS = ['seller_settlement_orders_v1', 'seller_settlement_costs_v1', 'seller_settlement_settings_v1'];

async function readSettlementBackupSnapshot() {
  if (!indexedDB.databases) throw new Error('이 브라우저에서는 안전한 백업 확인을 지원하지 않습니다. 최신 크롬에서 실행해 주세요.');
  const databases = await indexedDB.databases();
  let indexedDBData: { present: boolean; entries: { key: IDBValidKey; value: unknown }[] } = { present: false, entries: [] };
  if (databases.some((db) => db.name === 'seller_settlement_db')) {
    indexedDBData = await new Promise<typeof indexedDBData>((resolve, reject) => {
      const request = indexedDB.open('seller_settlement_db');
      // A concurrently removed database must not be recreated by a backup.
      request.onupgradeneeded = () => { request.transaction?.abort(); };
      request.onerror = () => reject(new Error('저장 데이터베이스를 읽지 못했습니다. 원본은 변경하지 않았습니다.'));
      request.onblocked = () => reject(new Error('다른 탭에서 데이터베이스를 사용 중입니다. 잠시 후 다시 시도해 주세요.'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        if (!db.objectStoreNames.contains('keyval')) {
          db.close(); reject(new Error('예상한 저장소가 없어 백업을 중단했습니다.')); return;
        }
        try {
          const transaction = db.transaction('keyval', 'readonly');
          const store = transaction.objectStore('keyval');
          const keys = store.getAllKeys();
          const values = store.getAll();
          transaction.oncomplete = () => {
            db.close();
            resolve({ present: true, entries: keys.result.map((key, index) => ({ key, value: values.result[index] })) });
          };
          transaction.onabort = transaction.onerror = () => { db.close(); reject(new Error('데이터 읽기에 실패해 백업을 중단했습니다.')); };
        } catch (error) { db.close(); reject(error); }
      };
    });
  }
  const localStorageData = Object.fromEntries(BACKUP_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));
  return { localStorage: localStorageData, indexedDB: indexedDBData };
}

async function downloadSettlementBackup(displayedOrders: number) {
  // Compare complete raw snapshots to avoid exporting halfway through a pending save.
  let current = await readSettlementBackupSnapshot();
  let stable = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const next = await readSettlementBackupSnapshot();
    if (JSON.stringify(current) === JSON.stringify(next)) { current = next; stable = true; break; }
    current = next;
  }
  if (!stable) throw new Error('저장 내용이 변경 중입니다. 입력을 마친 뒤 다시 백업해 주세요.');
  const countArray = (value: unknown) => Array.isArray(value) ? value.length : 0;
  const parseArrayCount = (raw: string | null) => { try { return raw ? countArray(JSON.parse(raw)) : 0; } catch { return 0; } };
  const idbValue = (key: string) => current.indexedDB.entries.find((entry) => entry.key === key)?.value;
  const counts = {
    localStorageOrders: parseArrayCount(current.localStorage[BACKUP_STORAGE_KEYS[0]]),
    indexedDBOrders: countArray(idbValue(BACKUP_STORAGE_KEYS[0])),
    localStorageCosts: parseArrayCount(current.localStorage[BACKUP_STORAGE_KEYS[1]]),
    indexedDBCosts: countArray(idbValue(BACKUP_STORAGE_KEYS[1])),
    displayedOrders,
  };
  if (Math.max(counts.localStorageOrders, counts.indexedDBOrders) < displayedOrders) {
    throw new Error('화면 주문 수보다 저장된 주문 수가 적습니다. 아직 백업이 안전하지 않아 중단했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!counts.localStorageOrders && !counts.indexedDBOrders && !confirm('현재 브라우저에 저장된 주문이 0건입니다. 원래 데이터를 사용하던 크롬인지 확인해 주세요. 빈 주문 백업도 다운로드할까요?')) return;
  const payload = JSON.stringify({ capturedAt: new Date().toISOString(), origin: location.origin, counts, raw: current });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const file = JSON.stringify({ format: 'seller-settlement-raw-backup', version: 1, sha256, payload }, null, 2);
  const url = URL.createObjectURL(new Blob([file], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ESliving-full-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  alert('전체 백업 파일 다운로드를 요청했습니다. 다운로드 폴더에 JSON 파일이 있는지 확인해 주세요.\n주문: IndexedDB ' + counts.indexedDBOrders + '건 / localStorage ' + counts.localStorageOrders + '건\n원가: IndexedDB ' + counts.indexedDBCosts + '건 / localStorage ' + counts.localStorageCosts + '건\n읽은 시점의 두 저장소 원본과 설정을 담았습니다. 입력을 멈춘 상태에서 파일을 확인해 주세요. 원본 데이터는 변경하지 않았습니다.\n이 파일에는 주문 정보가 포함될 수 있으니 안전하게 보관해 주세요.');
}

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
  onClearAllOrders?: () => void;
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
  onClearAllOrders,
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
              id="btn-full-backup"
              onClick={async (event) => {
                const button = event.currentTarget;
                button.disabled = true;
                try { await downloadSettlementBackup(totalOrdersCount); }
                catch (error) { alert('백업 실패: ' + (error instanceof Error ? error.message : String(error))); }
                finally { button.disabled = false; }
              }}
              title="주문·원가·설정의 두 저장소 원본을 JSON으로 백업합니다. 기존 데이터는 변경하지 않습니다."
              className="inline-flex items-center px-3.5 py-2 rounded-lg text-sm font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-1.5 text-slate-600" />
              전체 백업
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
              title="샘플 데이터 복원 (모든 쇼핑몰 샘플 엑셀 원본 복원)"
              className="inline-flex items-center px-2.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1 text-slate-600" />
              샘플 복원
            </button>

            {onClearAllOrders && (
              <button
                id="btn-clear-orders"
                onClick={onClearAllOrders}
                title="주문 내역 전체 비우기 (초기화)"
                className="inline-flex items-center px-2.5 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1 text-rose-600" />
                내역 비우기
              </button>
            )}
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
