import React from 'react';
import { 
  AlertCircle, 
  ArrowUpRight, 
  Banknote, 
  CheckCircle2, 
  Coins, 
  Layers, 
  Package, 
  Percent, 
  Receipt, 
  ShoppingBag, 
  TrendingUp, 
  Truck 
} from 'lucide-react';
import { PLATFORMS } from '../data/initialData';
import { DailySummary, OrderItem, PlatformType, SettlementSettings } from '../types';
import { formatKRW } from '../utils/calculator';

interface DashboardViewProps {
  orders: OrderItem[];
  selectedDate: string;
  settings: SettlementSettings;
  onSelectPlatform: (platform: PlatformType) => void;
  onOpenQuickCostModal: (order: OrderItem) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  orders,
  selectedDate,
  settings,
  onSelectPlatform,
  onOpenQuickCostModal,
}) => {
  // Filter orders by date if specific date is selected
  const filteredOrders = selectedDate === 'all' ? orders : orders.filter((o) => o.orderDate === selectedDate);

  // Compute Total Metrics
  const totalSales = filteredOrders.reduce((sum, o) => sum + (o.totalPrice + o.buyerShippingFee), 0);
  const totalProductSales = filteredOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  const totalBuyerShipping = filteredOrders.reduce((sum, o) => sum + o.buyerShippingFee, 0);
  const totalSettlement = filteredOrders.reduce((sum, o) => sum + o.settlementAmount, 0);
  const totalFees = filteredOrders.reduce((sum, o) => sum + o.feeAmount + (o.knowledgeShoppingFee || 0), 0);
  const totalCost = filteredOrders.reduce((sum, o) => sum + o.totalCost, 0);
  const totalPackaging = filteredOrders.reduce((sum, o) => sum + o.packagingCost, 0);
  const totalActualShipping = filteredOrders.reduce((sum, o) => sum + o.actualShippingCost, 0);
  const totalGrossProfit = filteredOrders.reduce((sum, o) => sum + o.grossProfit, 0);
  const totalVatDeducted = filteredOrders.reduce((sum, o) => sum + o.vatDeductedProfit, 0);
  const totalVat = filteredOrders.reduce((sum, o) => sum + o.vatAmount, 0);
  const totalIncomeTax = filteredOrders.reduce((sum, o) => sum + o.incomeTax, 0);
  const totalNetProfit = filteredOrders.reduce((sum, o) => sum + o.netProfit, 0);
  const avgMargin = totalSales > 0 ? Math.round((totalNetProfit / totalSales) * 100) : 0;

  // Unmatched cost items
  const unmatchedOrders = filteredOrders.filter((o) => !o.isCostMatched || o.unitCost === 0);

  // Bundle delivery stats
  const bundleOrders = filteredOrders.filter((o) => o.isBundleShipping);
  const bundleSavedShipping = filteredOrders.filter((o) => o.isBundleShipping && o.actualShippingCost === 0).length * settings.defaultActualShippingCost;

  // Platform Breakdown
  const platformStats = Object.values(PLATFORMS).map((p) => {
    const pOrders = filteredOrders.filter((o) => o.platform === p.id);
    const pSales = pOrders.reduce((sum, o) => sum + (o.totalPrice + o.buyerShippingFee), 0);
    const pSettlement = pOrders.reduce((sum, o) => sum + o.settlementAmount, 0);
    const pCost = pOrders.reduce((sum, o) => sum + o.totalCost, 0);
    const pNetProfit = pOrders.reduce((sum, o) => sum + o.netProfit, 0);
    const pMargin = pSales > 0 ? Math.round((pNetProfit / pSales) * 100) : 0;

    return {
      config: p,
      orderCount: pOrders.length,
      sales: pSales,
      settlement: pSettlement,
      cost: pCost,
      netProfit: pNetProfit,
      marginRate: pMargin,
    };
  });

  // Daily Comparison Summary
  const dates = Array.from(new Set(orders.map((o) => o.orderDate))) as string[];
  const dailySummaries: DailySummary[] = dates.sort().reverse().map((date) => {
    const dOrders = orders.filter((o) => o.orderDate === date);
    const dSales = dOrders.reduce((sum, o) => sum + (o.totalPrice + o.buyerShippingFee), 0);
    const dProductSales = dOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const dShipping = dOrders.reduce((sum, o) => sum + o.buyerShippingFee, 0);
    const dFees = dOrders.reduce((sum, o) => sum + o.feeAmount + (o.knowledgeShoppingFee || 0), 0);
    const dSettlement = dOrders.reduce((sum, o) => sum + o.settlementAmount, 0);
    const dCost = dOrders.reduce((sum, o) => sum + o.totalCost, 0);
    const dPack = dOrders.reduce((sum, o) => sum + o.packagingCost, 0);
    const dActualShip = dOrders.reduce((sum, o) => sum + o.actualShippingCost, 0);
    const dGross = dOrders.reduce((sum, o) => sum + o.grossProfit, 0);
    const dVat = dOrders.reduce((sum, o) => sum + o.vatAmount, 0);
    const dTax = dOrders.reduce((sum, o) => sum + o.incomeTax, 0);
    const dNet = dOrders.reduce((sum, o) => sum + o.netProfit, 0);
    const dMargin = dSales > 0 ? Math.round((dNet / dSales) * 100) : 0;

    return {
      date,
      orderCount: dOrders.length,
      totalSales: dSales,
      productSales: dProductSales,
      shippingRevenue: dShipping,
      feeTotal: dFees,
      settlementTotal: dSettlement,
      costTotal: dCost,
      packagingTotal: dPack,
      actualShippingTotal: dActualShip,
      grossProfitTotal: dGross,
      vatTotal: dVat,
      incomeTaxTotal: dTax,
      netProfitTotal: dNet,
      marginRate: dMargin,
    };
  });

  return (
    <div className="space-y-6">
      {/* Unmatched Cost Alert Banner if any */}
      {unmatchedOrders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between shadow-xs">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                원가 미등록 상품 {unmatchedOrders.length}건 발견
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                원가가 입력되지 않은 주문이 있어 정확한 순수익 계산을 위해 원가 매칭이 필요합니다. 아래 버튼을 눌러 1초 만에 원가를 등록하세요.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {unmatchedOrders.slice(0, 3).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => onOpenQuickCostModal(u)}
                    className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-white text-amber-900 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    <Coins className="w-3.5 h-3.5 mr-1 text-amber-600" />
                    {u.productName.length > 20 ? `${u.productName.substring(0, 20)}...` : u.productName} ({u.optionName}) 원가 입력
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main KPI Highlights Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
        {/* 1. 총 매출액 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold text-slate-600">일 총 매출액</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-slate-900 tracking-tight">
            {formatKRW(totalSales, true)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>상품 {formatKRW(totalProductSales)}</span>
            <span>배송비 {formatKRW(totalBuyerShipping)}</span>
          </div>
        </div>

        {/* 2. 정산예정액 & 수수료 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold text-slate-600">정산예정액 (공급가)</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-emerald-700 tracking-tight">
            {formatKRW(totalSettlement, true)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>수수료 합계</span>
            <span className="text-rose-600 font-medium">-{formatKRW(totalFees, true)}</span>
          </div>
        </div>

        {/* 3. 총 매입원가 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold text-slate-600">총 매입원가</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-amber-700 tracking-tight">
            {formatKRW(totalCost, true)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>원가 비중</span>
            <span className="font-medium text-slate-700">
              {totalSales > 0 ? Math.round((totalCost / totalSales) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* 4. 포장비 & 실택배비 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold text-slate-600">포장 · 실택배비</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-purple-700 tracking-tight">
            {formatKRW(totalPackaging + totalActualShipping, true)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>포장 {formatKRW(totalPackaging)}</span>
            <span>택배 {formatKRW(totalActualShipping)}</span>
          </div>
        </div>

        {/* 5. 최종 순수익 & 마진율 (핵심) */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-xl border border-slate-800 p-4 shadow-md col-span-2 md:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between text-indigo-200 mb-1">
            <span className="text-xs font-bold text-indigo-300">최종 순수익 (세후)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-400 text-slate-950">
              마진 {avgMargin}%
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-400 tracking-tight">
            {formatKRW(totalNetProfit, true)}
          </div>
          <div className="text-[11px] text-indigo-200/80 mt-1 flex items-center justify-between">
            <span>종소세 10% 차감후</span>
            <span className="font-semibold text-white">총 {filteredOrders.length}건 정산</span>
          </div>
        </div>
      </div>

      {/* Tax & Margin Detailed Strip */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-slate-700 flex items-center">
            <Receipt className="w-3.5 h-3.5 mr-1 text-slate-500" />
            세무 정산 내역:
          </span>
          <span className="text-slate-600">
            영업순익 <strong className="text-slate-800">{formatKRW(totalGrossProfit, true)}</strong>
          </span>
          <span className="text-slate-300">→</span>
          <span className="text-slate-600">
            부가세 제외(공제) <strong className="text-slate-800">{formatKRW(totalVatDeducted, true)}</strong> (부가세 {formatKRW(totalVat)})
          </span>
          <span className="text-slate-300">→</span>
          <span className="text-slate-600">
            종합소득세({settings.defaultIncomeTaxRate}%) <strong className="text-rose-600">-{formatKRW(totalIncomeTax, true)}</strong>
          </span>
        </div>

        {bundleOrders.length > 0 && (
          <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-indigo-600" />
            동일고객 합배송 {bundleOrders.length}건 감지 (실택배비 {formatKRW(bundleSavedShipping, true)} 자동 절감 정산)
          </div>
        )}
      </div>

      {/* Platform Channel Breakdown Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center">
            <Layers className="w-4 h-4 mr-1.5 text-indigo-600" />
            각 쇼핑몰 플랫폼별 일일 매출 및 순이익 집계
          </h3>
          <span className="text-xs text-slate-500">
            카드 클릭 시 해당 플랫폼 상세 엑셀 정산표로 바로 이동합니다.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {platformStats.map((item) => {
            const p = item.config;
            return (
              <div
                key={p.id}
                onClick={() => onSelectPlatform(p.id)}
                className="bg-white rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all p-4 cursor-pointer relative group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-md border ${p.badgeColor}`}>
                        {p.shortName}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        {item.orderCount}건 주문
                      </span>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                  </div>

                  {/* Revenue & Profit */}
                  <div className="space-y-1 my-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-slate-500">일 매출액</span>
                      <span className="text-base font-bold text-slate-900">
                        {formatKRW(item.sales, true)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-slate-500">정산예정액</span>
                      <span className="text-xs font-semibold text-emerald-700">
                        {formatKRW(item.settlement, true)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-slate-500">매입원가</span>
                      <span className="text-xs text-slate-600">
                        {formatKRW(item.cost, true)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Net Profit & Margin Bar */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-slate-500 block">최종 순수익</span>
                    <span className="text-sm font-extrabold text-indigo-700">
                      {formatKRW(item.netProfit, true)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-500 block">마진율</span>
                    <span className={`text-xs font-black px-1.5 py-0.5 rounded-sm ${
                      item.marginRate >= 30 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : item.marginRate >= 15 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {item.marginRate}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily Historic Comparison Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              일자별 전체 일매출 및 순이익 집계표
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            총 {dailySummaries.length}개 일자 데이터
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">정산 일자</th>
                <th className="py-2.5 px-3 text-center">주문수</th>
                <th className="py-2.5 px-3 text-right">일 총매출액</th>
                <th className="py-2.5 px-3 text-right">정산예정액</th>
                <th className="py-2.5 px-3 text-right">총 매입원가</th>
                <th className="py-2.5 px-3 text-right">포장/실배송비</th>
                <th className="py-2.5 px-3 text-right">순익(영업이익)</th>
                <th className="py-2.5 px-3 text-right">종합소득세(10%)</th>
                <th className="py-2.5 px-4 text-right font-bold text-indigo-700">최종 순수익</th>
                <th className="py-2.5 px-3 text-center font-bold">마진율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {dailySummaries.map((day) => (
                <tr key={day.date} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 mr-2" />
                    {day.date}
                  </td>
                  <td className="py-2.5 px-3 text-center font-medium">{day.orderCount}건</td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatKRW(day.totalSales, true)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">{formatKRW(day.settlementTotal, true)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{formatKRW(day.costTotal, true)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{formatKRW(day.packagingTotal + day.actualShippingTotal, true)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-800">{formatKRW(day.grossProfitTotal, true)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-600">-{formatKRW(day.incomeTaxTotal, true)}</td>
                  <td className="py-2.5 px-4 text-right font-extrabold text-indigo-700 text-sm bg-indigo-50/30">
                    {formatKRW(day.netProfitTotal, true)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                      day.marginRate >= 35 ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {day.marginRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Total Row */}
            <tfoot className="bg-slate-100/80 font-bold border-t-2 border-slate-300 text-slate-900">
              <tr>
                <td className="py-3 px-4">전체 기간 합계</td>
                <td className="py-3 px-3 text-center">{filteredOrders.length}건</td>
                <td className="py-3 px-3 text-right text-slate-900">{formatKRW(totalSales, true)}</td>
                <td className="py-3 px-3 text-right text-emerald-800">{formatKRW(totalSettlement, true)}</td>
                <td className="py-3 px-3 text-right text-slate-700">{formatKRW(totalCost, true)}</td>
                <td className="py-3 px-3 text-right text-slate-700">{formatKRW(totalPackaging + totalActualShipping, true)}</td>
                <td className="py-3 px-3 text-right text-slate-900">{formatKRW(totalGrossProfit, true)}</td>
                <td className="py-3 px-3 text-right text-rose-700">-{formatKRW(totalIncomeTax, true)}</td>
                <td className="py-3 px-4 text-right text-indigo-900 text-sm bg-indigo-100/50">
                  {formatKRW(totalNetProfit, true)}
                </td>
                <td className="py-3 px-3 text-center text-indigo-900">
                  {avgMargin}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
