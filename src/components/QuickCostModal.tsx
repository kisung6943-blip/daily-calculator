import React, { useState } from 'react';
import { Check, Coins, Plus, Sparkles } from 'lucide-react';
import { CostItem, OrderItem } from '../types';
import { formatKRW } from '../utils/calculator';

interface QuickCostModalProps {
  order: OrderItem | null;
  onClose: () => void;
  onSaveCost: (orderId: string, cost: number, saveToMaster: boolean, costItem?: Partial<CostItem>) => void;
}

export const QuickCostModal: React.FC<QuickCostModalProps> = ({
  order,
  onClose,
  onSaveCost,
}) => {
  if (!order) return null;

  const [costInput, setCostInput] = useState<string>(order.unitCost > 0 ? String(order.unitCost) : '');
  const [saveToMaster, setSaveToMaster] = useState(true);
  const [category, setCategory] = useState('주방용품/부품');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(costInput.replace(/[^0-9.-]/g, '')) || 0;
    if (num <= 0) {
      alert('원가를 0원 초과하여 입력해 주세요.');
      return;
    }

    onSaveCost(order.id, num, saveToMaster, {
      productName: order.productName,
      optionName: order.optionName,
      cost: num,
      category,
      updatedAt: new Date().toISOString().split('T')[0],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center">
            <Coins className="w-4 h-4 mr-1.5 text-rose-500" />
            상품 매입원가 즉시 입력
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
            ✕
          </button>
        </div>

        {/* Order Details Preview */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs mb-4">
          <div>
            <span className="text-slate-500 block text-[11px]">주문 상품명</span>
            <span className="font-bold text-slate-900">{order.productName}</span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
            <div>
              <span className="text-slate-500 text-[11px] mr-1">옵션:</span>
              <span className="font-semibold text-slate-700">{order.optionName || '기본'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] mr-1">판매가:</span>
              <span className="font-bold text-slate-900">{formatKRW(order.unitPrice, true)}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              개당 매입원가 (원) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                required
                autoFocus
                placeholder="예: 2500"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                className="w-full text-base font-black text-rose-900 bg-rose-50/40 p-2.5 pr-8 border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-500"
              />
              <span className="absolute right-3 top-3 font-bold text-rose-400">원</span>
            </div>
          </div>

          <div>
            <label className="flex items-start space-x-2 cursor-pointer bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100">
              <input
                type="checkbox"
                checked={saveToMaster}
                onChange={(e) => setSaveToMaster(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded mt-0.5"
              />
              <div>
                <span className="font-bold text-indigo-950 block">
                  원가 마스터에 자동 저장
                </span>
                <span className="text-[11px] text-indigo-700">
                  앞으로 동일한 상품명과 옵션으로 들어오는 모든 주문에 자동으로 이 원가가 적용됩니다.
                </span>
              </div>
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs"
            >
              원가 적용 및 순이익 산출
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
