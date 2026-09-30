import React, { useState, useMemo, useRef } from 'react';
import { 
  AlertTriangle, 
  ArrowUpDown,
  Calendar,
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
  Trophy,
  Truck, 
  UploadCloud 
} from 'lucide-react';
import { PLATFORMS } from '../data/initialData';
import { CostItem, OrderItem, PlatformType, SettlementSettings } from '../types';
import { engToKor, formatKRW, recalculateOrder } from '../utils/calculator';
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
  const [autoConvertEng, setAutoConvertEng] = useState(true);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [sortField, setSortField] = useState<'default' | 'netProfit' | 'productName' | 'marginRate' | 'totalPrice'>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const handleSearchChange = (val: string) => {
    if (autoConvertEng && /[a-zA-Z]/.test(val)) {
      setSearchTerm(engToKor(val));
    } else {
      setSearchTerm(val);
    }
  };

  const handleScrollLeft = () => {
    tableContainerRef.current?.scrollBy({ left: -400, behavior: 'smooth' });
  };

  const handleScrollRight = () => {
    tableContainerRef.current?.scrollBy({ left: 400, behavior: 'smooth' });
  };

  const handleScrollTop = () => {
    tableContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollBottom = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ top: tableContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  const platformConfig = PLATFORMS[platform] || PLATFORMS.smartstore;

  // Filter orders by platform and date and search (Memoized)
  const platformOrders = useMemo(() => orders.filter((o) => o.platform === platform), [orders, platform]);

  const platformTotals = useMemo(() => {
    let sales = 0, settlement = 0, cost = 0, fees = 0, shippingPkg = 0, netProfit = 0;
    for (let i = 0; i < platformOrders.length; i++) {
      const o = platformOrders[i];
      sales += (o.totalPrice + o.buyerShippingFee);
      settlement += o.settlementAmount;
      cost += o.totalCost;
      fees += (o.feeAmount + (o.knowledgeShoppingFee || 0));
      shippingPkg += (o.packagingCost + o.actualShippingCost);
      netProfit += o.netProfit;
    }
    const margin = sales > 0 ? Math.round((netProfit / sales) * 100) : 0;
    return { sales, settlement, cost, fees, shippingPkg, netProfit, margin };
  }, [platformOrders]);
  
  const dateFiltered = useMemo(() => {
    return selectedDate === 'all' ? platformOrders : platformOrders.filter((o) => o.orderDate === selectedDate);
  }, [platformOrders, selectedDate]);

  const korSearchTerm = useMemo(() => engToKor(searchTerm.trim()), [searchTerm]);
  const korSearchTermBase = useMemo(() => korSearchTerm.replace(/[ㄱ-ㅎ]+$/g, ''), [korSearchTerm]);

  const filteredOrders = useMemo(() => {
    return dateFiltered.filter((o) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const korTerm = korSearchTerm.toLowerCase();
      const korBase = korSearchTermBase.toLowerCase();

      const matchRaw =
        o.productName.toLowerCase().includes(term) ||
        o.optionName.toLowerCase().includes(term) ||
        o.recipient.toLowerCase().includes(term) ||
        o.orderNumber.toLowerCase().includes(term);

      const matchKor =
        korTerm !== term &&
        (o.productName.toLowerCase().includes(korTerm) ||
          o.optionName.toLowerCase().includes(korTerm) ||
          o.recipient.toLowerCase().includes(korTerm) ||
          o.orderNumber.toLowerCase().includes(korTerm));

      const matchKorBase =
        korBase &&
        korBase.length >= 2 &&
        (o.productName.toLowerCase().includes(korBase) ||
          o.optionName.toLowerCase().includes(korBase) ||
          o.recipient.toLowerCase().includes(korBase) ||
          o.orderNumber.toLowerCase().includes(korBase));

      return matchRaw || matchKor || matchKorBase;
    });
  }, [dateFiltered, searchTerm, korSearchTerm, korSearchTermBase]);

  // Sort orders according to sortField
  const sortedOrders = useMemo(() => {
    if (sortField === 'default') return filteredOrders;
    return [...filteredOrders].sort((a, b) => {
      let result = 0;
      if (sortField === 'netProfit') result = b.netProfit - a.netProfit;
      else if (sortField === 'marginRate') result = b.marginRate - a.marginRate;
      else if (sortField === 'productName') result = a.productName.localeCompare(b.productName);
      else if (sortField === 'totalPrice') result = b.totalPrice - a.totalPrice;
      return sortOrder === 'desc' ? result : -result;
    });
  }, [filteredOrders, sortField, sortOrder]);

  // Pagination state (Dynamic page size for smooth rendering)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(0);

  const totalPages = useMemo(() => {
    if (pageSize === 0) return 1;
    return Math.max(1, Math.ceil(sortedOrders.length / pageSize));
  }, [sortedOrders.length, pageSize]);

  const paginatedOrders = useMemo(() => {
    if (pageSize === 0) return sortedOrders;
    const start = (currentPage - 1) * pageSize;
    return sortedOrders.slice(start, start + pageSize);
  }, [sortedOrders, currentPage, pageSize]);

  // Group by product name to get Top Net Profit Ranking
  const productProfitSummary = useMemo(() => {
    const map = new Map<string, { productName: string; totalQty: number; totalRevenue: number; totalNetProfit: number; avgMargin: number }>();
    dateFiltered.forEach((o) => {
      const key = o.productName || '미지정 상품';
      const existing = map.get(key) || { productName: key, totalQty: 0, totalRevenue: 0, totalNetProfit: 0, avgMargin: 0 };
      existing.totalQty += o.quantity;
      existing.totalRevenue += o.totalPrice + o.buyerShippingFee;
      existing.totalNetProfit += o.netProfit;
      map.set(key, existing);
    });
    return Array.from(map.values()).map((p) => ({
      ...p,
      avgMargin: p.totalRevenue > 0 ? Math.round((p.totalNetProfit / p.totalRevenue) * 100) : 0,
    })).sort((a, b) => b.totalNetProfit - a.totalNetProfit);
  }, [dateFiltered]);

  // Daily Breakdown for this specific platform (O(N) single-pass optimization)
  const dailyPlatformSummaries = useMemo(() => {
    const map = new Map<string, {
      date: string;
      orderCount: number;
      sales: number;
      settlement: number;
      cost: number;
      fees: number;
      packagingTotal: number;
      actualShippingTotal: number;
      netProfit: number;
      marginRate: number;
    }>();

    for (let i = 0; i < platformOrders.length; i++) {
      const o = platformOrders[i];
      const date = o.orderDate || '기타';
      let entry = map.get(date);
      if (!entry) {
        entry = {
          date,
          orderCount: 0,
          sales: 0,
          settlement: 0,
          cost: 0,
          fees: 0,
          packagingTotal: 0,
          actualShippingTotal: 0,
          netProfit: 0,
          marginRate: 0,
        };
        map.set(date, entry);
      }
      entry.orderCount += 1;
      entry.sales += (o.totalPrice + o.buyerShippingFee);
      entry.settlement += o.settlementAmount;
      entry.cost += o.totalCost;
      entry.fees += (o.feeAmount + (o.knowledgeShoppingFee || 0));
      entry.packagingTotal += o.packagingCost;
      entry.actualShippingTotal += o.actualShippingCost;
      entry.netProfit += o.netProfit;
    }

    const list = Array.from(map.values());
    list.forEach((d) => {
      d.marginRate = d.sales > 0 ? Math.round((d.netProfit / d.sales) * 100) : 0;
    });
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [platformOrders]);

  const handleSortToggle = (field: 'netProfit' | 'productName' | 'marginRate' | 'totalPrice') => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Calculate Column Totals (Memoized O(N) single-pass)
  const {
    sumTotalSales,
    sumProductSales,
    sumBuyerShipping,
    sumFees,
    sumSettlement,
    sumTotalCost,
    sumPackaging,
    sumActualShipping,
    sumGrossProfit,
    sumVatDeducted,
    sumIncomeTax,
    sumNetProfit,
    avgMargin,
  } = useMemo(() => {
    let sales = 0, productSales = 0, buyerShipping = 0, fees = 0, settlement = 0;
    let cost = 0, packaging = 0, actualShipping = 0, grossProfit = 0;
    let vatDeducted = 0, incomeTax = 0, netProfit = 0;

    for (let i = 0; i < filteredOrders.length; i++) {
      const o = filteredOrders[i];
      sales += (o.totalPrice + o.buyerShippingFee);
      productSales += o.totalPrice;
      buyerShipping += o.buyerShippingFee;
      fees += (o.feeAmount + (o.knowledgeShoppingFee || 0));
      settlement += o.settlementAmount;
      cost += o.totalCost;
      packaging += o.packagingCost;
      actualShipping += o.actualShippingCost;
      grossProfit += o.grossProfit;
      vatDeducted += o.vatDeductedProfit;
      incomeTax += o.incomeTax;
      netProfit += o.netProfit;
    }

    const margin = sales > 0 ? Math.round((netProfit / sales) * 100) : 0;

    return {
      sumTotalSales: sales,
      sumProductSales: productSales,
      sumBuyerShipping: buyerShipping,
      sumFees: fees,
      sumSettlement: settlement,
      sumTotalCost: cost,
      sumPackaging: packaging,
      sumActualShipping: actualShipping,
      sumGrossProfit: grossProfit,
      sumVatDeducted: vatDeducted,
      sumIncomeTax: incomeTax,
      sumNetProfit: netProfit,
      avgMargin: margin,
    };
  }, [filteredOrders]);

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
    } else if (field === 'orderDate') {
      updated.orderDate = editValue.trim() || order.orderDate;
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

      {/* Product Net Profit Top Ranking Summary Widget */}
      {productProfitSummary.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-indigo-50/80 border border-emerald-200 rounded-xl p-3 shadow-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                🏆
              </div>
              <div>
                <span className="font-extrabold text-xs text-slate-900">
                  상품별 최종 순수익 Top 랭킹 (어떤 상품이 순수익이 가장 많이 남는지)
                </span>
                <span className="text-[11px] text-slate-500 font-normal ml-2">
                  (총 {productProfitSummary.length}개 품목)
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => handleSortToggle('netProfit')}
                className={`text-[11px] font-extrabold px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                  sortField === 'netProfit'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                💰 순수익 높은순 {sortField === 'netProfit' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
              </button>
              <button
                type="button"
                onClick={() => handleSortToggle('marginRate')}
                className={`text-[11px] font-extrabold px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                  sortField === 'marginRate'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-blue-800 border-blue-300 hover:bg-blue-50'
                }`}
              >
                📈 마진율 높은순 {sortField === 'marginRate' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs pt-1">
            {productProfitSummary.slice(0, 4).map((p, rankIdx) => (
              <div key={rankIdx} className="bg-white/90 rounded-lg p-2.5 border border-slate-200 shadow-2xs flex flex-col justify-between hover:border-emerald-300 transition-all">
                <div className="flex items-start justify-between gap-1">
                  <span className="font-bold text-slate-900 truncate text-xs flex-1" title={p.productName}>
                    {rankIdx === 0 ? '🥇 ' : rankIdx === 1 ? '🥈 ' : rankIdx === 2 ? '🥉 ' : `${rankIdx + 1}. `}
                    {p.productName}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-100 text-slate-600 shrink-0">
                    {p.totalQty}개 판매
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between pt-1.5 border-t border-slate-100">
                  <span className="text-[10px] text-slate-500">매출 {formatKRW(p.totalRevenue)}</span>
                  <span className={`font-black text-xs ${p.totalNetProfit > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    순수익 {formatKRW(p.totalNetProfit, true)} ({p.avgMargin}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Historic Breakdown Table for this specific Platform */}
      {dailyPlatformSummaries.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-900">
                📅 [{platformConfig.shortName}] 일자별(일별) 매출 및 정산 집계표
              </h3>
              <span className="text-[11px] text-slate-500 font-normal">
                (총 {dailyPlatformSummaries.length}개 일자 데이터)
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              * 해당 사이트의 일별 매출 및 정산액을 한눈에 확인할 수 있습니다
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left">
              <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">정산 일자</th>
                  <th className="py-2.5 px-3 text-center">주문수</th>
                  <th className="py-2.5 px-3 text-right">일 총매출액</th>
                  <th className="py-2.5 px-3 text-right">정산예정액</th>
                  <th className="py-2.5 px-3 text-right">총 매입원가</th>
                  <th className="py-2.5 px-3 text-right">플랫폼 수수료</th>
                  <th className="py-2.5 px-3 text-right">포장/실배송비</th>
                  <th className="py-2.5 px-4 text-right font-bold text-indigo-700">최종 순수익</th>
                  <th className="py-2.5 px-3 text-center font-bold">마진율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {dailyPlatformSummaries.map((day) => (
                  <tr key={day.date} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                      {day.date}
                    </td>
                    <td className="py-2.5 px-3 text-center font-medium">{day.orderCount}건</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatKRW(day.sales, true)}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">{formatKRW(day.settlement, true)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{formatKRW(day.cost, true)}</td>
                    <td className="py-2.5 px-3 text-right text-rose-600">-{formatKRW(day.fees, true)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{formatKRW(day.packagingTotal + day.actualShippingTotal, true)}</td>
                    <td className="py-2.5 px-4 text-right font-extrabold text-indigo-700 text-sm bg-indigo-50/30">
                      {formatKRW(day.netProfit, true)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                        day.marginRate >= 30 ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {day.marginRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Summary Footer */}
              <tfoot className="bg-slate-100/90 font-bold border-t-2 border-slate-300 text-slate-900">
                <tr>
                  <td className="py-2.5 px-4">[{platformConfig.shortName}] 기간 합계</td>
                  <td className="py-2.5 px-3 text-center">{platformOrders.length}건</td>
                  <td className="py-2.5 px-3 text-right text-slate-900">{formatKRW(platformTotals.sales, true)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-800">{formatKRW(platformTotals.settlement, true)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-700">{formatKRW(platformTotals.cost, true)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700">-{formatKRW(platformTotals.fees, true)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-700">{formatKRW(platformTotals.shippingPkg, true)}</td>
                  <td className="py-2.5 px-4 text-right text-indigo-900 text-sm bg-indigo-100/50">
                    {formatKRW(platformTotals.netProfit, true)}
                  </td>
                  <td className="py-2.5 px-3 text-center text-indigo-900">
                    {platformTotals.margin}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative shrink-0" style={{ width: '600px', minWidth: '400px', maxWidth: '100%', flexShrink: 0 }}>
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="input-search-table"
            type="text"
            inputMode="text"
            lang="ko"
            autoCapitalize="off"
            autoCorrect="off"
            style={{ imeMode: 'active' as any, width: '100%', minWidth: '100%' }}
            placeholder="상품명, 옵션명, 수취인, 주문번호 검색 (영타 입력 시 한글 자동 변환)..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-400 font-medium"
          />
          {korSearchTerm !== searchTerm.trim() && korSearchTerm.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchTerm(korSearchTerm)}
              className="absolute right-2 top-1.5 text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
              title="클릭 시 한글 글자로 즉시 변경합니다"
            >
              🔤 한글 변환 적용: {korSearchTerm}
            </button>
          )}
        </div>
        <label className="flex items-center space-x-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-lg cursor-pointer whitespace-nowrap shrink-0">
          <input
            type="checkbox"
            checked={autoConvertEng}
            onChange={(e) => setAutoConvertEng(e.target.checked)}
            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
          />
          <span>영타 실시간 한글변환</span>
        </label>
        <div className="flex items-center space-x-1.5 shrink-0">
          <button
            type="button"
            onClick={handleScrollTop}
            className="inline-flex items-center px-2 py-1.5 rounded-lg text-xs font-bold bg-white text-indigo-700 border border-slate-300 hover:bg-indigo-50 shadow-xs cursor-pointer"
            title="테이블 맨 위로 스크롤합니다"
          >
            ▲ 맨 위로
          </button>
          <button
            type="button"
            onClick={handleScrollBottom}
            className="inline-flex items-center px-2 py-1.5 rounded-lg text-xs font-bold bg-white text-indigo-700 border border-slate-300 hover:bg-indigo-50 shadow-xs cursor-pointer"
            title="테이블 맨 아래로 스크롤합니다"
          >
            ▼ 맨 아래로
          </button>
          <button
            type="button"
            onClick={handleScrollLeft}
            className="inline-flex items-center px-2 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-xs cursor-pointer"
            title="테이블을 좌측으로 스크롤합니다"
          >
            ◀ 좌측
          </button>
          <button
            type="button"
            onClick={handleScrollRight}
            className="inline-flex items-center px-2 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-xs cursor-pointer"
            title="테이블을 우측으로 스크롤합니다"
          >
            우측 ▶
          </button>
        </div>
      </div>

      {/* Main Formatted Settlement Table (Exact Layout matching User's Screenshots) */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        <div ref={tableContainerRef} className="overflow-auto max-h-[calc(100vh-260px)] min-h-[350px] scrollbar-thin">
          <table className="min-w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-300 shadow-xs">
              <tr className="divide-x divide-slate-300">
                <th className="py-2.5 px-3 whitespace-nowrap bg-amber-100 text-amber-900 border-r border-slate-300 w-[95px] min-w-[95px] max-w-[95px]" style={{ position: 'sticky', left: 0, top: 0, zIndex: 40 }}>날짜</th>
                <th 
                  onClick={() => handleSortToggle('productName')}
                  className="py-2.5 px-4 w-[260px] min-w-[260px] max-w-[260px] bg-amber-200 text-amber-950 cursor-pointer hover:bg-amber-300 border-r border-slate-300 shadow-2xs"
                  style={{ position: 'sticky', left: 95, top: 0, zIndex: 40 }}
                  title="클릭하여 상품명 정렬"
                >
                  <div className="flex items-center justify-between">
                    <span>상품명 📌</span>
                    {sortField === 'productName' ? (
                      <span className="text-xs font-bold">{sortOrder === 'desc' ? '▼' : '▲'}</span>
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-amber-900 opacity-60" />
                    )}
                  </div>
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap w-[150px] min-w-[150px] max-w-[150px] bg-amber-100 text-amber-950 border-r-2 border-slate-400 shadow-sm" style={{ position: 'sticky', left: 355, top: 0, zIndex: 40 }}>
                  옵션명 📌
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap bg-amber-100/70 text-amber-900">주문번호</th>
                {platform === 'smartstore' && (
                  <th className="py-2.5 px-3 whitespace-nowrap bg-amber-100/70 text-amber-900">상품번호</th>
                )}
                <th className="py-2.5 px-2.5 whitespace-nowrap text-center bg-amber-100/70 text-amber-900">
                  수량
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right bg-amber-100/70 text-amber-900">
                  판매금액(단가)
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap bg-amber-100/70 text-amber-900">
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
                <th 
                  onClick={() => handleSortToggle('netProfit')}
                  className="py-2.5 px-4 whitespace-nowrap text-right bg-blue-200 text-blue-950 font-black text-sm cursor-pointer hover:bg-blue-300 transition-colors"
                  title="클릭하여 순수익 높은순/낮은순 정렬"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>최종 순수익</span>
                    {sortField === 'netProfit' ? (
                      <span className="text-xs font-bold">{sortOrder === 'desc' ? '▼' : '▲'}</span>
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-blue-950 opacity-70" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => handleSortToggle('marginRate')}
                  className="py-2.5 px-3 whitespace-nowrap text-center bg-blue-100 text-blue-900 font-bold cursor-pointer hover:bg-blue-200 transition-colors"
                  title="클릭하여 마진율 높은순/낮은순 정렬"
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>마진율</span>
                    {sortField === 'marginRate' ? (
                      <span className="text-xs font-bold">{sortOrder === 'desc' ? '▼' : '▲'}</span>
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-blue-800 opacity-60" />
                    )}
                  </div>
                </th>
                <th className="py-2.5 px-2 whitespace-nowrap text-center bg-slate-200 text-slate-700">
                  관리
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-slate-800">
              {sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={22} className="py-12 text-center text-slate-400">
                    <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    해당 조건의 정산 데이터가 없습니다. 상단의 '엑셀 업로드' 또는 '새 주문행 추가'를 이용해 주세요.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((ord, idx) => {
                  const isBundleSub = ord.isBundleShipping && ord.actualShippingCost === 0;
                  const cellBg = !ord.isCostMatched ? 'bg-rose-50' : idx % 2 === 1 ? 'bg-slate-50' : 'bg-white';

                  return (
                    <tr
                      key={ord.id}
                      className={`divide-x divide-slate-200 hover:bg-amber-50/50 ${cellBg}`}
                    >
                      {/* 1. Date */}
                      <td
                        onClick={() => handleStartEdit(ord, 'orderDate', ord.orderDate)}
                        className={`py-2 px-3 whitespace-nowrap font-medium text-slate-900 hover:bg-yellow-50 cursor-pointer border-r border-slate-300 w-[95px] min-w-[95px] max-w-[95px] ${cellBg}`}
                        style={{ position: 'sticky', left: 0, zIndex: 20 }}
                        title="클릭하여 날짜 수정"
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'orderDate' ? (
                          <input
                            type="date"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(ord)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ord)}
                            autoFocus
                            className="w-24 text-xs p-1 border rounded bg-white text-slate-900 font-bold"
                          />
                        ) : (
                          ord.orderDate
                        )}
                      </td>

                      {/* 2. Product Name (Sticky) */}
                      <td
                        onClick={() => handleStartEdit(ord, 'productName', ord.productName)}
                        className={`py-2 px-3 text-slate-900 w-[260px] min-w-[260px] max-w-[260px] border-r border-slate-300 hover:bg-yellow-50 cursor-pointer ${cellBg}`}
                        style={{ position: 'sticky', left: 95, zIndex: 20 }}
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
                            className="w-full text-xs p-1 border rounded bg-white font-bold"
                          />
                        ) : (
                          <div>
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 break-words leading-snug">{ord.productName}</span>
                              {platform === 'coupang' && ord.feeRate === 6 && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 shrink-0">
                                  쌀 6%
                                </span>
                              )}
                              {platform === 'coupang' && (ord.feeRate === 11.66 || /누룽지/.test(ord.productName)) && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-orange-100 text-orange-800 shrink-0" title="부가세별도 10.6% (부가세포함 11.66%)">
                                  누룽지 11.66%
                                </span>
                              )}
                            </div>
                            {/* Option & Net Profit Badges directly under Product Name */}
                            <div className="mt-1 flex items-center space-x-1 flex-wrap gap-y-1">
                              <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 text-[10px] shrink-0">
                                옵션: {ord.optionName || '기본'}
                              </span>
                              <span className={`inline-flex items-center text-[10.5px] font-black px-2 py-0.5 rounded-full border shadow-2xs ${
                                ord.netProfit > 0
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                                  : ord.netProfit < 0
                                  ? 'bg-rose-100 text-rose-900 border-rose-400'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}>
                                💰 순수익 {formatKRW(ord.netProfit, true)} ({ord.marginRate}%)
                              </span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 3. Option Name (Sticky) */}
                      <td
                        onClick={() => handleStartEdit(ord, 'optionName', ord.optionName)}
                        className={`py-2 px-3 font-semibold text-slate-800 w-[150px] min-w-[150px] max-w-[150px] break-words hover:bg-yellow-50 cursor-pointer border-r-2 border-slate-400 shadow-xs ${cellBg}`}
                        style={{ position: 'sticky', left: 355, zIndex: 20 }}
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
                            className="w-full text-xs p-1 border rounded bg-white font-bold"
                          />
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100/90 text-slate-800 border border-slate-200 font-medium text-[11px]">
                            {ord.optionName || '기본'}
                          </span>
                        )}
                      </td>

                      {/* 4. Order Number */}
                      <td className={`py-2 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600 ${cellBg}`}>
                        {ord.orderNumber}
                      </td>

                      {/* 5. Product Number (for smartstore) */}
                      {platform === 'smartstore' && (
                        <td className={`py-2 px-3 whitespace-nowrap font-mono text-[11px] text-slate-500 ${cellBg}`}>
                          {ord.productNumber || '-'}
                        </td>
                      )}

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

                      {/* 7. Selling Price (단가 / 옵션+판매가) */}
                      <td
                        onClick={() => handleStartEdit(ord, 'unitPrice', ord.unitPrice)}
                        className="py-2 px-3 text-right font-semibold text-slate-900 hover:bg-yellow-50 cursor-pointer"
                      >
                        {editingCell?.id === ord.id && editingCell?.field === 'unitPrice' ? (
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
                          formatKRW(ord.unitPrice)
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
                          `-${formatKRW(Math.abs(ord.feeAmount))}`
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
                            `-${formatKRW(Math.abs(ord.knowledgeShoppingFee || 0))}`
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
                            className="px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-rose-600 text-white hover:bg-rose-700 shadow-2xs cursor-pointer"
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
                  <td className="py-3 px-3 bg-amber-200 border-r border-slate-400 w-[95px] min-w-[95px] max-w-[95px]" style={{ position: 'sticky', left: 0, zIndex: 30 }}>합계 ({filteredOrders.length}건)</td>
                  <td className="py-3 px-4 font-extrabold text-slate-900 bg-amber-200 border-r border-slate-400 w-[260px] min-w-[260px] max-w-[260px]" style={{ position: 'sticky', left: 95, zIndex: 30 }}>전체 품목 합계</td>
                  <td className="py-3 px-3 bg-amber-200 border-r-2 border-slate-400 w-[150px] min-w-[150px] max-w-[150px] shadow-xs" style={{ position: 'sticky', left: 355, zIndex: 30 }}>-</td>
                  <td className="py-3 px-3">-</td>
                  {platform === 'smartstore' && <td className="py-3 px-3">-</td>}
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
        {/* Pagination & Page Size Control Bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-300 flex items-center justify-between text-xs font-medium">
          <div className="flex items-center space-x-3">
            <span className="text-slate-600 font-medium">
              {pageSize > 0 ? (
                <>총 <strong>{sortedOrders.length}</strong>개 주문 중 <strong>{sortedOrders.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, sortedOrders.length)}</strong>개 표시 중</>
              ) : (
                <>총 <strong>{sortedOrders.length}</strong>개 주문 전체 표시 중</>
              )}
            </span>
            <div className="flex items-center space-x-1">
              <span className="text-slate-500">페이지 당:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-700 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value={0}>전체보기 (기본)</option>
                <option value={50}>50개씩</option>
                <option value={100}>100개씩</option>
                <option value={30}>30개씩</option>
              </select>
            </div>
          </div>

          {pageSize > 0 && totalPages > 1 && (
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer shadow-2xs"
              >
                ◀ 이전
              </button>
              <span className="px-2 font-bold text-indigo-700">
                {currentPage} / {totalPages} 페이지
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer shadow-2xs"
              >
                다음 ▶
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
