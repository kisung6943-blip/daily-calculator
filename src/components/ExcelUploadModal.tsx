import React, { useState, useRef } from 'react';
import { 
  AlertCircle, 
  AlertTriangle,
  CalendarDays,
  Check, 
  FileSpreadsheet, 
  Layers, 
  Loader2, 
  ShieldCheck,
  Sparkles, 
  UploadCloud 
} from 'lucide-react';
import { PLATFORMS } from '../data/initialData';
import { CostItem, OrderItem, PlatformType, SettlementSettings } from '../types';
import { formatKRW, processAllOrders } from '../utils/calculator';
import { parseExcelOrders } from '../utils/excelParser';

interface ExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  costItems: CostItem[];
  settings: SettlementSettings;
  onImportOrders: (newOrders: OrderItem[], importMode: 'append' | 'replace_platform' | 'replace_all') => void;
}

export const ExcelUploadModal: React.FC<ExcelUploadModalProps> = ({
  isOpen,
  onClose,
  costItems,
  settings,
  onImportOrders,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | 'auto'>('auto');
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<{
    orders: OrderItem[];
    detectedPlatform: PlatformType;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'append' | 'replace_platform' | 'replace_all'>('replace_all');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (incomingFile: File, overrideCustomDate?: boolean, dateValue?: string) => {
    setFile(incomingFile);
    setErrorMsg(null);
    setIsProcessing(true);

    const isCustom = overrideCustomDate !== undefined ? overrideCustomDate : useCustomDate;
    const dateToUse = isCustom ? (dateValue || targetDate) : undefined;

    try {
      const forced = selectedPlatform === 'auto' ? undefined : selectedPlatform;
      const res = await parseExcelOrders(incomingFile, forced, settings, dateToUse);
      
      // Auto-match cost items & bundle delivery
      const processed = processAllOrders(res.orders, costItems, settings);
      setParsedPreview({
        orders: processed,
        detectedPlatform: res.detectedPlatform,
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || '엑셀 파일을 읽는 중 오류가 발생했습니다.');
      setParsedPreview(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = () => {
    if (!parsedPreview || parsedPreview.orders.length === 0) return;
    onImportOrders(parsedPreview.orders, importMode);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col p-6 animate-in fade-in zoom-in duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center space-x-2">
            <UploadCloud className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">쇼핑몰 정산 엑셀 파일 업로드</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
          {/* Date Selector Section */}
          <div className="bg-indigo-50/70 rounded-xl border border-indigo-200/80 p-3.5 space-y-2">
            <div className="flex items-center space-x-2 text-indigo-900 font-bold">
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              <span>정산 적용 날짜 설정:</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center space-x-1.5 cursor-pointer font-medium text-slate-800">
                <input
                  type="radio"
                  name="uploadDateMode"
                  checked={!useCustomDate}
                  onChange={() => {
                    setUseCustomDate(false);
                    if (file) handleFileChange(file, false, targetDate);
                  }}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span>엑셀 파일 내 날짜 자동 감지</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer font-medium text-slate-800">
                <input
                  type="radio"
                  name="uploadDateMode"
                  checked={useCustomDate}
                  onChange={() => {
                    setUseCustomDate(true);
                    if (file) handleFileChange(file, true, targetDate);
                  }}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span>특정 정산 날짜 지정:</span>
              </label>

              {useCustomDate && (
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => {
                    const newD = e.target.value;
                    setTargetDate(newD);
                    if (file) handleFileChange(file, true, newD);
                  }}
                  className="bg-white border border-indigo-300 rounded-lg px-2.5 py-1 text-xs font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 shadow-xs cursor-pointer"
                />
              )}
            </div>
          </div>

          {/* Platform Selector */}
          <div>
            <label className="block font-bold text-slate-800 mb-1.5">
              업로드할 쇼핑몰 플랫폼 선택:
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedPlatform('auto');
                  if (file) handleFileChange(file);
                }}
                className={`p-2 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                  selectedPlatform === 'auto'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 mx-auto mb-0.5" />
                자동 감지
              </button>
              {Object.values(PLATFORMS).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlatform(p.id);
                    if (file) handleFileChange(file);
                  }}
                  className={`p-2 rounded-lg border text-center font-semibold transition-all cursor-pointer ${
                    selectedPlatform === p.id
                      ? `${p.bgColor} ${p.textColor} ${p.borderColor} font-bold shadow-xs`
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p.shortName}
                </button>
              ))}
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/60 hover:bg-indigo-50/30 rounded-xl p-8 text-center cursor-pointer transition-all"
          >
            <FileSpreadsheet className="w-10 h-10 mx-auto text-indigo-500 mb-2" />
            <p className="font-bold text-slate-800 text-sm">
              {file ? file.name : '엑셀 파일(.xlsx, .xls, .csv)을 드래그하거나 클릭하여 선택하세요'}
            </p>
            <p className="text-slate-500 text-[11px] mt-1">
              스마트스토어, 쿠팡, 오늘의집, 자사몰, 11번가, G마켓, 옥션 원본 정산 엑셀 지원
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
          </div>

          {/* Loading Indicator */}
          {isProcessing && (
            <div className="flex items-center justify-center py-4 space-x-2 text-indigo-600 font-semibold">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>엑셀 데이터를 분석하고 원가를 자동 매칭 중입니다...</span>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Parsed Preview */}
          {parsedPreview && (
            <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 flex items-center">
                  <Check className="w-4 h-4 text-emerald-600 mr-1" />
                  파싱 완료: 총 {parsedPreview.orders.length}개 주문 데이터 감지됨 (플랫폼:{' '}
                  {PLATFORMS[parsedPreview.detectedPlatform]?.name || parsedPreview.detectedPlatform})
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  원가 매칭률:{' '}
                  {Math.round(
                    (parsedPreview.orders.filter((o) => o.isCostMatched).length /
                      parsedPreview.orders.length) *
                      100
                  )}
                  %
                </span>
              </div>

              {/* Mini preview table */}
              <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-slate-200">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold">
                    <tr>
                      <th className="py-1.5 px-2 text-left">일자</th>
                      <th className="py-1.5 px-2 text-left">상품명</th>
                      <th className="py-1.5 px-2 text-left">수취인</th>
                      <th className="py-1.5 px-2 text-right">판매금액</th>
                      <th className="py-1.5 px-2 text-right">매입원가</th>
                      <th className="py-1.5 px-2 text-right font-bold text-indigo-700">순수익</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedPreview.orders.slice(0, 5).map((ord, idx) => (
                      <tr key={idx}>
                        <td className="py-1 px-2">{ord.orderDate}</td>
                        <td className="py-1 px-2 font-medium truncate max-w-[150px]">{ord.productName}</td>
                        <td className="py-1 px-2">{ord.recipient}</td>
                        <td className="py-1 px-2 text-right">{formatKRW(ord.totalPrice)}</td>
                        <td className="py-1 px-2 text-right text-rose-800">
                          {ord.unitCost > 0 ? formatKRW(ord.unitCost) : '미등록'}
                        </td>
                        <td className="py-1 px-2 text-right font-bold text-indigo-700">{formatKRW(ord.netProfit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedPreview.orders.length > 5 && (
                <p className="text-[10px] text-slate-400 text-center">
                  외 {parsedPreview.orders.length - 5}건 추가 데이터
                </p>
              )}

              {/* Import Mode Options */}
              <div className="pt-2.5 border-t border-slate-200 space-y-1.5">
                <span className="font-bold text-slate-800 text-xs block">가져오기 방식 선택:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <label className={`flex items-start space-x-2 p-2 rounded-lg border cursor-pointer transition-all ${
                    importMode === 'replace_platform'
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace_platform'}
                      onChange={() => setImportMode('replace_platform')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="block text-xs font-bold">해당 쇼핑몰만 교체 (추천)</span>
                      <span className="text-[10px] text-slate-500 font-normal block leading-tight mt-0.5">
                        업로드한 쇼핑몰({PLATFORMS[parsedPreview.detectedPlatform]?.shortName || parsedPreview.detectedPlatform})의 기존 데이터만 덮어쓰고 타 쇼핑몰 내역은 유지
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start space-x-2 p-2 rounded-lg border cursor-pointer transition-all ${
                    importMode === 'append'
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="block text-xs font-bold">기존 데이터에 추가</span>
                      <span className="text-[10px] text-slate-500 font-normal block leading-tight mt-0.5">
                        기존에 등록된 모든 내역을 유지하면서 새 주문건을 추가
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start space-x-2 p-2 rounded-lg border cursor-pointer transition-all ${
                    importMode === 'replace_all'
                      ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace_all'}
                      onChange={() => setImportMode('replace_all')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <span className="block text-xs font-bold text-rose-800">전체 데이터 초기화</span>
                      <span className="text-[10px] text-slate-500 font-normal block leading-tight mt-0.5">
                        모든 쇼핑몰의 기존 내역을 싹 비우고 전체 교체
                      </span>
                    </div>
                  </label>
                </div>

                {/* Dynamic Safety Notice */}
                <div className={`mt-3 p-2.5 rounded-lg border text-xs leading-relaxed ${
                  importMode === 'replace_platform'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : importMode === 'append'
                    ? 'bg-blue-50 border-blue-200 text-blue-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  {importMode === 'replace_platform' && (
                    <div className="font-semibold flex items-center space-x-1">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mr-1" />
                      <span>
                        안전 안내: <strong>{PLATFORMS[parsedPreview.detectedPlatform]?.name || parsedPreview.detectedPlatform}</strong> 데이터만 교체됩니다. 기존 등록된 타 쇼핑몰(G마켓, 쿠팡, 스마트스토어 등)의 데이터는 <strong>절대 삭제되지 않고 그대로 유지</strong>됩니다!
                      </span>
                    </div>
                  )}
                  {importMode === 'append' && (
                    <div className="font-semibold flex items-center space-x-1">
                      <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mr-1" />
                      <span>
                        추가 안내: 기존 등록된 모든 쇼핑몰 데이터가 삭제되지 않고 새 데이터가 덧붙여집니다.
                      </span>
                    </div>
                  )}
                  {importMode === 'replace_all' && (
                    <div className="font-semibold flex items-center space-x-1">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mr-1" />
                      <span>
                        경고: 기존 등록된 <strong>모든 쇼핑몰의 모든 주문 데이터가 싹 삭제</strong>되고 이 파일 내용으로 전체 초기화됩니다.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-slate-100 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={!parsedPreview || parsedPreview.orders.length === 0}
            onClick={handleConfirmImport}
            className="px-4 py-2 rounded-lg font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            정산 데이터에 반영하기
          </button>
        </div>
      </div>
    </div>
  );
};
