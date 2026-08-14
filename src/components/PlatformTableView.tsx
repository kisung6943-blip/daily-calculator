import React, { useState } from 'react';
import { 
  AlertTriangle, 
  Check, 
  ChevronDown, 
  Download, 
  Edit3, 
  FileSpreadsheet, 
  Filter, 
  Layers, 
  Plus, 
  Search, 
  Sparkles, 
  Trash2, 
  Truck, 
  UploadCloud 
} from 'lucide-react';
import { PLATFORMS } from '../data/initialData';
import { CostItem, OrderItem, PlatformType, SettlementSettings } from '../types';
import { formatKRW, recalculateOrder } from '../utils/calculator';
import { exportOrdersToExcel } from '../utils/excelParser';

interface PlatformTableViewProps {
  platform: PlatformType;
  orders: OrderItem[];
  costItems: CostItem[];
  settings: SettlementSettings;
  selectedDate: string;
  onUpdateOrder: (updated: OrderItem) => void;
  onDeleteOrder: (id: string) => void;
  onAddOrder: (newOrder: OrderItem) => void;
  onOpenQuickCostModal: (order: OrderItem) => void;
  onOpenUploadModal: () => void;
}

export const PlatformTableView: React.FC<PlatformTableViewProps> = ({
  platform,
  orders,
  costItems,
  settings,
  selectedDate,
  onUpdateOrder,
  onDeleteOrder,
  onAddOrder,
  onOpenQuickCostModal,
  onOpenUploadModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const platformConfig = PLATFORMS[platform] || PLATFORMS.smartstore;

  // Filter orders by platform and date and search
  const platformOrders = orders.filter((o) => o.platform === platform);
  const dateFiltered = selectedDate === 'all' ? platformOrders : platformOrders.filter((o) => o.orderDate === selectedDate);
  const filteredOrders = dateFiltered.filter((o) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      o.productName.toLowerCase().includes(term) ||
      o.optionName.toLowerCase().includes(term) ||
      o.recipient.toLowerCase().includes(term) ||
      o.orderNumber.toLowerCase().includes(term)
    );
  });

  // Calculate Column Totals
  const sumTotalSales = filteredOrders.reduce((sum, o) => sum + (o.totalPrice + o.buyerShippingFee), 0);
  const sumProductSales = filteredOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  const sumBuyerShipping = filteredOrders.reduce((sum, o) => sum + o.buyerShippingFee, 0);
  const sumFees = filteredOrders.reduce((sum, o) => sum + o.feeAmount + (o.knowledgeShoppingFee || 0), 0);
  const sumSettlement = filteredOrders.reduce((sum, o) => sum + o.settlementAmount, 0);
  const sumTotalCost = filteredOrders.reduce((sum, o) => sum + o.totalCost, 0);
  const sumPackaging = filteredOrders.reduce((sum, o) => sum + o.packagingCost, 0);
  const sumActualShipping = filteredOrders.reduce((sum, o) => sum + o.actualShippingCost, 0);
  const sumGrossProfit = filteredOrders.reduce((sum, o) => sum + o.grossProfit, 0);
  const sumVatDeducted = filteredOrders.reduce((sum, o) => sum + o.vatDeductedProfit, 0);
  const sumIncomeTax = filteredOrders.reduce((sum, o) => sum + o.incomeTax, 0);
  const sumNetProfit = filteredOrders.reduce((sum, o) => sum + o.netProfit, 0);
  const avgMargin = sumTotalSales > 0 ? Math.round((sumNetProfit / sumTotalSales) * 100) : 0;

  // Cell Edit Handlers
  const handleStartEdit = (order: OrderItem, field: string, currentValue: any) => {
    setEditingCell({ id: order.id, field });
    setEditValue(String(currentValue !== undefined ? currentValue : ''));
  };

  const handleSaveEdit = (order: OrderItem) => {
    if (!editingCell) return;

    const { field } = editingCell;
    const numVal = Number(editValue.replace(/[^0-9.-]/g, ''));
    let updated: Partial<OrderItem> = { ...order };

    if (field === 'unitCost') {
      updated.unitCost = numVal;
      updated.isCostMatched = numVal > 0;
    } else if (field === 'unitPrice') {
      updated.unitPrice = numVal;
      updated.totalPrice = numVal * (order.quantity || 1);
    } else if (field === 'totalPrice') {
      updated.totalPrice = numVal;
      if (order.quantity > 0) {
        updated.unitPrice = Math.round(numVal / order.quantity);
      }
    } else if (field === 'quantity') {
      const q = Math.max(1, numVal || 1);
      updated.quantity = q;
      updated.totalPrice = (order.unitPrice || 0) * q;
    } else if (field === 'buyerShippingFee') {
      updated.buyerShippingFee = numVal;
      updated.isShippingFree = numVal === 0;
    } else if (field === 'actualShippingCost') {
      updated.actualShippingCost = numVal;
    } else if (field === 'packagingCost') {
      updated.packagingCost = numVal;
    } else if (field === 'feeAmount') {
      updated.feeAmount = numVal;
    } else if (field === 'knowledgeShoppingFee') {
      updated.knowledgeShoppingFee = numVal;
    } else if (field === 'settlementAmount') {
      updated.settlementAmount = numVal;
    } else if (field === 'recipient') {
      updated.recipient = editValue.trim();
    } else if (field === 'productName') {
      updated.productName = editValue.trim();
    } else if (field === 'optionName') {
      updated.optionName = editValue.trim();
    }

    const recalculated = recalculateOrder(updated, settings, Boolean(order.isBundleShipping && order.actualShippingCost === 0));
    onUpdateOrder(recalculated);
    setEditingCell(null);
  };

  // Add Empty Order Row
  const handleAddNewRow = () => {
    const today = selectedDate !== 'all' ? selectedDate : new Date().toISOString().split('T')[0];
    const newOrd: OrderItem = recalculateOrder(
      {
        platform,
        orderDate: today,
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        productName: '신규 상품명',
        optionName: '기본',
        quantity: 1,
        recipient: '고객명',
        unitPrice: 10000,
        totalPrice: 10000,
        buyerShippingFee: 3000,
        unitCost: 0,
        isCostMatched: false,
      },
      settings,
      false
    );
    onAddOrder(newOrd);
  };

  return (
    <div className="space-y-4">
      {/* Platform Header Card with Overview */}
      <div className={`rounded-xl border p-4 shadow-xs ${platformConfig.bgColor} ${platformConfig.borderColor}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 text-sm font-extrabold rounded-lg border bg-white shadow-xs ${platformConfig.textColor} ${platformConfig.borderColor}`}>
              {platformConfig.name}
            </span>
            <div>
              <p className="text-xs text-slate-700 font-medium">
                {platformConfig.description}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                포장비 {settings.defaultPackagingCost}원 · 실택배비 {settings.defaultActualShippingCost}원 · 종합소득세 {settings.defaultIncomeTaxRate}%
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id={`btn-add-row-${platform}`}
              onClick={handleAddNewRow}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1 text-indigo-600" />
              새 주문행 추가
            </button>
            <button
              id={`btn-upload-${platform}`}
              onClick={onOpenUploadModal}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 mr-1" />
              {platformConfig.shortName} 엑셀 업로드
            </button>
            <button
              id={`btn-export-${platform}`}
              onClick={() => exportOrdersToExcel(filteredOrders, platform, `${platformConfig.shortName}_정산표_${selectedDate}.xlsx`)}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              엑셀 다운로드
            </button>
          </div>
        </div>

        {/* Quick Platform Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 mt-3 pt-3 border-t border-slate-200/60 text-xs">
          <div className="bg-white/80 rounded-lg p-2.5 border border-slate-200/60">
            <span className="text-[11px] text-slate-500 block">주문 건수</span>
            <span className="text-sm font-bold text-slate-900">{filteredOrders.length}건</span>
          </div>
          <div className="bg-white/80 rounded-lg p-2.5 border border-slate-200/60">
            <span className="text-[11px] text-slate-500 block">일 총 매출액</span>
            <span className="text-sm font-bold text-slate-900">{formatKRW(sumTotalSales, true)}</span>
          </div>
          <div className="bg-white/80 rounded-lg p-2.5 border border-slate-200/60">
            <span className="text-[11px] text-slate-500 block">정산예정액</span>
            <span className="text-sm font-bold text-emerald-700">{formatKRW(sumSettlement, true)}</span>
          </div>
          <div className="bg-white/80 rounded-lg p-2.5 border border-slate-200/60">
            <span className="text-[11px] text-slate-500 block">총 매입원가</span>
            <span className="text-sm font-bold text-amber-700">{formatKRW(sumTotalCost, true)}</span>
          </div>
          <div className="bg-white/80 rounded-lg p-2.5 border border-slate-200/60">
            <span className="text-[11px] text-slate-500 block">플랫폼 수수료</span>
            <span className="text-sm font-bold text-rose-600">-{formatKRW(sumFees, true)}</span>
          </div>
          <div className="bg-indigo-900 text-white rounded-lg p-2.5 border border-indigo-800 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-indigo-200">최종 순수익</span>
              <span className="text-[10px] font-bold px-1 bg-emerald-400 text-slate-950 rounded">
                {avgMargin}%
              </span>
            </div>
            <span className="text-sm font-extrabold text-emerald-400">{formatKRW(sumNetProfit, true)}</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="input-search-table"
            type="text"
            placeholder="상품명, 옵션명, 수취인, 주문번호 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-400 font-medium"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          셀(원가, 수량, 판매가 등)을 클릭하면 즉시 수정 및 자동 재계산됩니다.
        </div>
      </div>

      {/* Main Formatted Settlement Table (Exact Layout matching User's Screenshots) */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[620px] scrollbar-thin">
          <table className="min-w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-300 shadow-xs">
              <tr className="divide-x divide-slate-300">
                <th className="py-2.5 px-3 whitespace-nowrap bg-amber-100/70 text-amber-900">날짜</th>
                <th className="py-2.5 px-3 whitespace-nowrap bg-amber-100/70 text-amber-900">주문번호</th>
                {platform === 'smartstore' && (
                  <th className="py-2.5 px-3 whitespace-nowrap bg-amber-100/70 text-amber-900">상품번호</th>
                )}
                <th className="py-2.5 px-4 whitespace-nowrap min-w-[280px] bg-amber-200/80 text-amber-950">
                  상품명
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap min-w-[160px] bg-amber-100/70 text-amber-900">
                  옵션명
                </th>
                <th className="py-2.5 px-2.5 whitespace-nowrap text-center bg-amber-100/70 text-amber-900">
                  수량
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-amber-100/70 text-amber-900">
                  판매금액(단가)
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap bg-amber-100/70 text-amber-900 w-[110px]">
                  수취인
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-amber-200/70 text-amber-950">
                  고객배송비
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-amber-100/70 text-amber-900">
                  수수료
                </th>
                {platform === 'smartstore' && (
                  <th className="py-2.5 px-3 whitespace-nowrap text-right bg-amber-100/70 text-amber-900">
                    지식쇼핑(2%)
                  </th>
                )}
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-amber-200/80 text-amber-950 font-extrabold">
                  정산금액(정산가)
                </th>
                {/* Cost Columns (Pink highlight like Excel) */}
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-rose-100 text-rose-950 font-bold border-l-2 border-rose-300">
                  매입원가
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-rose-100 text-rose-950 font-bold">
                  원가합계
                </th>
                {/* Expenses (Packaging, Actual Shipping) */}
                <th className="py-2.5 px-2.5 whitespace-nowrap text-right bg-indigo-50 text-indigo-900">
                  포장비
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-indigo-50 text-indigo-900">
                  실택배비
                </th>
                {/* Profit & Taxes (Orange/Blue highlight like Excel) */}
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-amber-200 text-amber-950 font-bold">
                  순익(공헌)
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-sky-100 text-sky-950">
                  부가세제외
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-sky-100 text-sky-950">
                  종합소득세({settings.defaultIncomeTaxRate}%)
                </th>
                <th className="py-2.5 px-4 whitespace-nowrap text-right bg-blue-200 text-blue-950 font-black text-sm">
                  최종 순수익
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap text-center bg-blue-100 text-blue-900 font-bold">
                  마진율
                </th>
                <th className="py-2.5 px-2 whitespace-nowrap text-center bg-slate-200 text-slate-700">
                  관리
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-slate-800">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={22} className="py-12 text-center text-slate-400">
                    <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    해당 조건의 정산 데이터가 없습니다. 상단의 '엑셀 업로드' 또는 '새 주문행 추가'를 이용해 주세요.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord, idx) => {
                  const isBundleSub = ord.isBundleShipping && ord.actualShippingCost === 0;

                  return (
                    <tr
                      key={ord.id}
                      className={`divide-x divide-slate-200 hover:bg-amber-50/40 transition-colors ${
                        idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                      } ${!ord.isCostMatched ? 'bg-rose-50/40' : ''}`}
                    >
                      {/* 1. Date */}
                      <td className="py-2 px-3 whitespace-nowrap font-medium text-slate-900">
                        {ord.orderDate}
                      </td>

                      {/* 2. Order Number */}
                      <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                        {ord.orderNumber}
                      </td>

                      {/* 3. Product Number (for smartstore) */}
                      {platform === 'smartstore' && (
                        <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px] text-slate-500">
                          {ord.productNumber || '-'}
                        </td>
                      )}

                      {/* 4. Product Name */}
                      <td
                        onClick={() => handleStartEdit(ord, 'productName', ord.productName)}
                        className="py-2 px-4 font-semibold text-slate-900 max-w-[420px] truncate hover:bg-yellow-50 cursor-pointer"
                        title={ord.productName}
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'productName' ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-full text-xs p-1 border rounded bg-white"
                          />
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            <span className="truncate">{ord.productName}</span>
                            {platform === 'coupang' && ord.feeRate === 6 && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 shrink-0">
                                쌀 6%
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 5. Option Name */}
                      <td
                        onClick={() => handleStartEdit(ord, 'optionName', ord.optionName)}
                        className="py-2 px-3 text-slate-600 max-w-[280px] truncate hover:bg-yellow-50 cursor-pointer"
                        title={ord.optionName}
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'optionName' ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-full text-xs p-1 border rounded bg-white"
                          />
                        ) : (
                          ord.optionName || '-'
                        )}
                      </td>

                      {/* 6. Quantity */}
                      <td
                        onClick={() => handleStartEdit(ord, 'quantity', ord.quantity)}
                        className="py-2 px-2.5 text-center font-bold text-slate-900 hover:bg-yellow-50 cursor-pointer"
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'quantity' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-12 text-xs p-1 border rounded bg-white text-center"
                          />
                        ) : (
                          ord.quantity
                        )}
                      </td>

                      {/* 7. Selling Price */}
                      <td
                        onClick={() => handleStartEdit(ord, 'totalPrice', ord.totalPrice)}
                        className="py-2 px-3 text-right font-semibold text-slate-900 hover:bg-yellow-50 cursor-pointer"
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'totalPrice' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-20 text-xs p-1 border rounded bg-white text-right"
                          />
                        ) : (
                          formatKRW(ord.totalPrice)
                        )}
                      </td>

                      {/* 8. Recipient */}
                      <td
                        onClick={() => handleStartEdit(ord, 'recipient', ord.recipient)}
                        className="py-2 px-3 whitespace-nowrap hover:bg-yellow-50 cursor-pointer"
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'recipient' ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-20 text-xs p-1 border rounded bg-white"
                          />
                        ) : (
                          <div className="flex items-center space-x-1">
                            <span className="font-medium text-slate-900">{ord.recipient}</span>
                            {ord.isBundleShipping && (
                              <span
                                title="동일고객 합배송 묶음"
                                className={`text-[10px] px-1 py-0.2 rounded font-bold ${
                                  isBundleSub
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-indigo-100 text-indigo-700'
                                }`}
                              >
                                {isBundleSub ? '합배송(0원)' : '합배송(대표)'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 9. Buyer Shipping Fee */}
                      <td
                        onClick={() => handleStartEdit(ord, 'buyerShippingFee', ord.buyerShippingFee)}
                        className="py-2 px-3 text-right font-medium hover:bg-yellow-50 cursor-pointer text-slate-800"
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'buyerShippingFee' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-16 text-xs p-1 border rounded bg-white text-right"
                          />
                        ) : ord.buyerShippingFee === 0 ? (
                          <span className="text-slate-400">무료</span>
                        ) : (
                          formatKRW(ord.buyerShippingFee)
                        )}
                      </td>

                      {/* 10. Fee */}
                      <td
                        onClick={() => handleStartEdit(ord, 'feeAmount', ord.feeAmount)}
                        className="py-2 px-3 text-right text-rose-600 font-medium hover:bg-yellow-50 cursor-pointer"
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'feeAmount' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-16 text-xs p-1 border rounded bg-white text-right"
                          />
                        ) : (
                          `-${formatKRW(ord.feeAmount)}`
                        )}
                      </td>

                      {/* 11. Smartstore Knowledge shopping fee */}
                      {platform === 'smartstore' && (
                        <td
                          onClick={() => handleStartEdit(ord, 'knowledgeShoppingFee', ord.knowledgeShoppingFee)}
                          className="py-2 px-3 text-right text-rose-600 font-medium hover:bg-yellow-50 cursor-pointer"
                        >
                          {editingCell?.id === ord.id && editingCell?.field === 'knowledgeShoppingFee' ? (
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleSaveEdit(ord)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                              autoFocus
                              className="w-16 text-xs p-1 border rounded bg-white text-right"
                            />
                          ) : (
                            `-${formatKRW(ord.knowledgeShoppingFee || 0)}`
                          )}
                        </td>
                      )}

                      {/* 12. Settlement Amount */}
                      <td
                        onClick={() => handleStartEdit(ord, 'settlementAmount', ord.settlementAmount)}
                        className="py-2 px-3 text-right font-bold text-emerald-800 bg-emerald-50/40 hover:bg-emerald-100 cursor-pointer"
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'settlementAmount' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-20 text-xs p-1 border rounded bg-white text-right font-bold"
                          />
                        ) : (
                          formatKRW(ord.settlementAmount)
                        )}
                      </td>

                      {/* 13. Unit Cost (Pink) */}
                      <td
                        onClick={() => handleStartEdit(ord, 'unitCost', ord.unitCost)}
                        className="py-2 px-3 text-right bg-rose-50/80 hover:bg-rose-100 cursor-pointer"
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'unitCost' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-16 text-xs p-1 border rounded bg-white text-right font-bold text-rose-900"
                          />
                        ) : ord.unitCost > 0 ? (
                          <span className="font-bold text-rose-900">{formatKRW(ord.unitCost)}</span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenQuickCostModal(ord);
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-500 text-white animate-pulse"
                          >
                            원가입력
                          </button>
                        )}
                      </td>

                      {/* 14. Total Cost (Pink) */}
                      <td className="py-2 px-3 text-right bg-rose-50/80 font-bold text-rose-900">
                        {formatKRW(ord.totalCost)}
                      </td>

                      {/* 15. Packaging Cost */}
                      <td
                        onClick={() => handleStartEdit(ord, 'packagingCost', ord.packagingCost)}
                        className="py-2 px-2.5 text-right text-slate-600 hover:bg-indigo-100 cursor-pointer bg-slate-50/50"
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'packagingCost' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-14 text-xs p-1 border rounded bg-white text-right"
                          />
                        ) : (
                          formatKRW(ord.packagingCost)
                        )}
                      </td>

                      {/* 16. Actual Shipping Cost (Highlight bundle 0 won) */}
                      <td
                        onClick={() => handleStartEdit(ord, 'actualShippingCost', ord.actualShippingCost)}
                        className={`py-2 px-3 text-right hover:bg-indigo-100 cursor-pointer ${
                          isBundleSub ? 'bg-purple-50 font-bold text-purple-700' : 'bg-slate-50/50 text-slate-700'
                        }`}
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'actualShippingCost' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-16 text-xs p-1 border rounded bg-white text-right"
                          />
                        ) : isBundleSub ? (
                          <span className="text-purple-600 font-bold">0원(합배송)</span>
                        ) : (
                          formatKRW(ord.actualShippingCost)
                        )}
                      </td>

                      {/* 17. Gross Profit (Orange) */}
                      <td className="py-2 px-3 text-right font-bold text-amber-900 bg-amber-50">
                        {formatKRW(ord.grossProfit)}
                      </td>

                      {/* 18. VAT Deducted Profit (Blue) */}
                      <td className="py-2 px-3 text-right font-semibold text-slate-800 bg-sky-50/60">
                        {formatKRW(ord.vatDeductedProfit)}
                      </td>

                      {/* 19. Income Tax */}
                      <td className="py-2 px-3 text-right text-rose-600 bg-sky-50/60">
                        -{formatKRW(ord.incomeTax)}
                      </td>

                      {/* 20. Net Profit (Final) */}
                      <td className="py-2 px-4 text-right font-black text-indigo-700 text-sm bg-indigo-50/60">
                        {formatKRW(ord.netProfit)}
                      </td>

                      {/* 21. Margin Rate */}
                      <td className="py-2 px-3 text-center bg-blue-50/50">
                        <span className={`px-1.5 py-0.5 rounded font-black text-[11px] ${
                          ord.marginRate >= 40
                            ? 'bg-emerald-100 text-emerald-800'
                            : ord.marginRate >= 20
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {ord.marginRate}%
                        </span>
                      </td>

                      {/* 22. Actions */}
                      <td className="py-2 px-2 text-center whitespace-nowrap bg-slate-50">
                        <button
                          onClick={() => onDeleteOrder(ord.id)}
                          title="주문 삭제"
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Bottom Total Summary Row */}
            {filteredOrders.length > 0 && (
              <tfoot className="bg-amber-200/90 text-slate-950 font-black border-t-2 border-slate-400 sticky bottom-0 z-10 shadow-md">
                <tr className="divide-x divide-slate-400">
                  <td className="py-3 px-3">합계 ({filteredOrders.length}건)</td>
                  <td className="py-3 px-3">-</td>
                  {platform === 'smartstore' && <td className="py-3 px-3">-</td>}
                  <td className="py-3 px-4 font-extrabold text-slate-900">전체 품목 합계</td>
                  <td className="py-3 px-3">-</td>
                  <td className="py-3 px-2.5 text-center">
                    {filteredOrders.reduce((s, o) => s + o.quantity, 0)}
                  </td>
                  <td className="py-3 px-3 text-right">{formatKRW(sumProductSales)}</td>
                  <td className="py-3 px-3">-</td>
                  <td className="py-3 px-3 text-right">{formatKRW(sumBuyerShipping)}</td>
                  <td className="py-3 px-3 text-right text-rose-800">-{formatKRW(sumFees)}</td>
                  {platform === 'smartstore' && (
                    <td className="py-3 px-3 text-right text-rose-800">
                      -{formatKRW(filteredOrders.reduce((s, o) => s + (o.knowledgeShoppingFee || 0), 0))}
                    </td>
                  )}
                  <td className="py-3 px-3 text-right text-emerald-950 font-black">
                    {formatKRW(sumSettlement)}
                  </td>
                  <td className="py-3 px-3 text-right text-rose-950">-</td>
                  <td className="py-3 px-3 text-right text-rose-950 font-black">
                    {formatKRW(sumTotalCost)}
                  </td>
                  <td className="py-3 px-2.5 text-right">{formatKRW(sumPackaging)}</td>
                  <td className="py-3 px-3 text-right">{formatKRW(sumActualShipping)}</td>
                  <td className="py-3 px-3 text-right font-black">{formatKRW(sumGrossProfit)}</td>
                  <td className="py-3 px-3 text-right">{formatKRW(sumVatDeducted)}</td>
                  <td className="py-3 px-3 text-right text-rose-800">-{formatKRW(sumIncomeTax)}</td>
                  <td className="py-3 px-4 text-right text-indigo-950 text-base font-black bg-indigo-200">
                    {formatKRW(sumNetProfit, true)}
                  </td>
                  <td className="py-3 px-3 text-center text-sm font-black bg-blue-200">
                    {avgMargin}%
                  </td>
                  <td className="py-3 px-2 text-center">-</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
