import React, { useState } from 'react';
import { 
  Check, 
  Coins, 
  HelpCircle, 
  Package, 
  Percent, 
  Receipt, 
  RotateCcw, 
  Save, 
  Settings, 
  Truck 
} from 'lucide-react';
import { DEFAULT_SETTINGS } from '../data/initialData';
import { SettlementSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettlementSettings;
  onSaveSettings: (newSettings: SettlementSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [formState, setFormState] = useState<SettlementSettings>({ ...settings });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formState);
    onClose();
  };

  const handleResetDefaults = () => {
    if (confirm('기본 정산 설정값으로 복원하시겠습니까?')) {
      setFormState({ ...DEFAULT_SETTINGS });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">정산 및 세무 환경설정</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          {/* 1. Basic Expense Rates (포장비, 실택배비) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 flex items-center text-xs">
              <Truck className="w-4 h-4 mr-1.5 text-indigo-600" />
              기본 배송 및 포장 비용 설정
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  기본 포장비 (원/건)
                </label>
                <input
                  type="number"
                  value={formState.defaultPackagingCost}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      defaultPackagingCost: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-bold text-slate-900"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">기본 500원</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  실제 계약 택배비 (원/건)
                </label>
                <input
                  type="number"
                  value={formState.defaultActualShippingCost}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      defaultActualShippingCost: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-bold text-slate-900"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">기본 1,900원</span>
              </div>
            </div>

            {/* Bundle shipping checkbox */}
            <div className="pt-2 border-t border-slate-200">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.autoBundleShipping}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      autoBundleShipping: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <span className="font-semibold text-slate-800">
                  동일 고객 다건 주문 자동 합배송 정산 (2번째 품목부터 실택배비 0원)
                </span>
              </label>
            </div>
          </div>

          {/* 2. Tax Settings (종합소득세, 부가세) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 flex items-center text-xs">
              <Receipt className="w-4 h-4 mr-1.5 text-indigo-600" />
              세무 및 세금 공제 설정
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  종합소득세 예상 세율 (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    value={formState.defaultIncomeTaxRate}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        defaultIncomeTaxRate: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full p-2 pr-7 border border-slate-300 rounded-lg bg-white font-bold text-slate-900"
                  />
                  <span className="absolute right-2.5 top-2 font-bold text-slate-400">%</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-0.5 block">기본 10% (과세표준에 따라 조정)</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  부가세 차감 방식
                </label>
                <select
                  value={formState.vatCalculationMethod}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      vatCalculationMethod: e.target.value as any,
                    })
                  }
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
                >
                  <option value="simple10">10% 일괄 공제 (순익 × 90%)</option>
                  <option value="standard">표준 산출 (매출부가세 - 매입부가세)</option>
                </select>
                <span className="text-[11px] text-slate-500 mt-0.5 block">엑셀 수식 기반 10% 차감</span>
              </div>
            </div>
          </div>

          {/* 3. Platform Specific Fees */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 flex items-center text-xs">
              <Percent className="w-4 h-4 mr-1.5 text-indigo-600" />
              플랫폼별 기본 수수료율 설정
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">쿠팡 일반 수수료 (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formState.coupangDefaultFee}
                  onChange={(e) =>
                    setFormState({ ...formState, coupangDefaultFee: Number(e.target.value) || 0 })
                  }
                  className="w-full p-1.5 border rounded bg-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">쿠팡 쌀/양곡 수수료 (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formState.coupangRiceFee}
                  onChange={(e) =>
                    setFormState({ ...formState, coupangRiceFee: Number(e.target.value) || 0 })
                  }
                  className="w-full p-1.5 border rounded bg-white text-emerald-700 font-bold"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">자사몰 PG 수수료 (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formState.homepageFee}
                  onChange={(e) =>
                    setFormState({ ...formState, homepageFee: Number(e.target.value) || 0 })
                  }
                  className="w-full p-1.5 border rounded bg-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">오늘의집 기본 수수료 (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formState.ohouseDefaultFee}
                  onChange={(e) =>
                    setFormState({ ...formState, ohouseDefaultFee: Number(e.target.value) || 0 })
                  }
                  className="w-full p-1.5 border rounded bg-white"
                />
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              기본값으로 복원
            </button>

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                닫기
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs cursor-pointer inline-flex items-center"
              >
                <Save className="w-4 h-4 mr-1.5" />
                설정 저장 및 전체 재계산
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
