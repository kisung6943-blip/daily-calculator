import React, { useState, useEffect, useMemo } from 'react';
import { CostMasterView } from './components/CostMasterView';
import { DashboardView } from './components/DashboardView';
import { ExcelUploadModal } from './components/ExcelUploadModal';
import { Header } from './components/Header';
import { PlatformTableView } from './components/PlatformTableView';
import { QuickCostModal } from './components/QuickCostModal';
import { SettingsModal } from './components/SettingsModal';
import { DEFAULT_SETTINGS, INITIAL_COST_ITEMS, INITIAL_ORDERS, PLATFORMS } from './data/initialData';
import { CostItem, OrderItem, PlatformType, SettlementSettings } from './types';
import { normalizeText, processAllOrders, recalculateOrder } from './utils/calculator';
import { exportOrdersToExcel } from './utils/excelParser';

const STORAGE_ORDERS_KEY = 'seller_settlement_orders_v1';
const STORAGE_COSTS_KEY = 'seller_settlement_costs_v1';
const STORAGE_SETTINGS_KEY = 'seller_settlement_settings_v1';

export default function App() {
  // 1. Core State with LocalStorage Persistence
  const [orders, setOrders] = useState<OrderItem[]>(() => {
    let rawOrders = INITIAL_ORDERS;
    try {
      const saved = localStorage.getItem(STORAGE_ORDERS_KEY);
      if (saved) rawOrders = JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    let rawCosts = INITIAL_COST_ITEMS;
    try {
      const savedCosts = localStorage.getItem(STORAGE_COSTS_KEY);
      if (savedCosts) rawCosts = JSON.parse(savedCosts);
    } catch (e) {}
    return processAllOrders(rawOrders, rawCosts, { ...DEFAULT_SETTINGS, defaultIncomeTaxRate: 10 });
  });

  const [costItems, setCostItems] = useState<CostItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_COSTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_COST_ITEMS;
  });

  const [settings, setSettings] = useState<SettlementSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          defaultIncomeTaxRate: 10,
        };
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SETTINGS;
  });

  // 2. Navigation & Filter State
  const [currentTab, setCurrentTab] = useState<'dashboard' | PlatformType | 'cost_master'>('dashboard');
  const [selectedDate, setSelectedDate] = useState<string>('all');

  // 3. Modal States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [quickCostTargetOrder, setQuickCostTargetOrder] = useState<OrderItem | null>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(orders));
    } catch (e) {}
  }, [orders]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COSTS_KEY, JSON.stringify(costItems));
    } catch (e) {}
  }, [costItems]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
  }, [settings]);

  // Available unique dates
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.orderDate) set.add(o.orderDate);
    });
    return Array.from(set).sort().reverse();
  }, [orders]);

  // Unmatched cost items count
  const unmatchedCostCount = useMemo(() => {
    return orders.filter((o) => !o.isCostMatched || o.unitCost === 0).length;
  }, [orders]);

  // Re-synchronize costs for all orders
  const handleApplyCostsToOrders = () => {
    const reprocessed = processAllOrders(orders, costItems, settings);
    setOrders(reprocessed);
  };

  // Order CRUD Handlers
  const handleUpdateOrder = (updated: OrderItem) => {
    // 1. If unitCost was updated/entered, automatically save to Master Cost DB so it's NEVER lost
    let currentCosts = costItems;
    if (updated.unitCost && updated.unitCost > 0 && updated.productName) {
      const normP = normalizeText(updated.productName);
      const normO = normalizeText(updated.optionName);
      const existingIdx = costItems.findIndex((c) => {
        const itemP = normalizeText(c.productName);
        const itemO = normalizeText(c.optionName);
        return (itemP === normP || itemP === updated.productName.toLowerCase()) && (itemO === normO || (!normO && !itemO));
      });

      if (existingIdx >= 0) {
        currentCosts = [...costItems];
        currentCosts[existingIdx] = {
          ...currentCosts[existingIdx],
          cost: updated.unitCost,
          updatedAt: new Date().toISOString().split('T')[0],
        };
      } else {
        const newCostItem: CostItem = {
          id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          productName: updated.productName,
          optionName: updated.optionName || '기본',
          cost: updated.unitCost,
          category: '수동입력',
          updatedAt: new Date().toISOString().split('T')[0],
        };
        currentCosts = [newCostItem, ...costItems];
      }
      setCostItems(currentCosts);
    }

    const updatedList = orders.map((o) => (o.id === updated.id ? updated : o));
    setOrders(processAllOrders(updatedList, currentCosts, settings));
  };

  const handleDeleteOrder = (id: string) => {
    if (confirm('해당 주문 내역을 삭제하시겠습니까?')) {
      const remaining = orders.filter((o) => o.id !== id);
      setOrders(processAllOrders(remaining, costItems, settings));
    }
  };

  const handleAddOrder = (newOrder: OrderItem) => {
    const newList = [newOrder, ...orders];
    setOrders(processAllOrders(newList, costItems, settings));
  };

  // Cost Master CRUD Handlers
  const handleAddCostItem = (item: CostItem) => {
    const newItems = [item, ...costItems];
    setCostItems(newItems);
    setOrders((prev) => processAllOrders(prev, newItems, settings));
  };

  const handleUpdateCostItem = (updated: CostItem) => {
    const newItems = costItems.map((c) => (c.id === updated.id ? updated : c));
    setCostItems(newItems);
    setOrders((prev) => processAllOrders(prev, newItems, settings));
  };

  const handleDeleteCostItem = (id: string) => {
    if (confirm('해당 원가 항목을 삭제하시겠습니까?')) {
      const newItems = costItems.filter((c) => c.id !== id);
      setCostItems(newItems);
      setOrders((prev) => processAllOrders(prev, newItems, settings));
    }
  };

  const handleBulkAddCostItems = (items: CostItem[]) => {
    // Merge without duplicates (by productName + optionName)
    const existingMap = new Map<string, CostItem>();
    costItems.forEach((c) => {
      existingMap.set(`${c.productName.trim()}__${(c.optionName || '').trim()}`, c);
    });

    items.forEach((newItem) => {
      existingMap.set(`${newItem.productName.trim()}__${(newItem.optionName || '').trim()}`, newItem);
    });

    const merged = Array.from(existingMap.values());
    setCostItems(merged);
    setOrders((prev) => processAllOrders(prev, merged, settings));
  };

  // Quick Cost Modal Save Handler
  const handleQuickCostSave = (
    orderId: string,
    cost: number,
    saveToMaster: boolean,
    costItemData?: Partial<CostItem>
  ) => {
    let currentCosts = [...costItems];
    if (saveToMaster && costItemData) {
      const newItem: CostItem = {
        id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        productName: costItemData.productName || '',
        optionName: costItemData.optionName || '기본',
        cost,
        category: costItemData.category || '주방용품/부품',
        updatedAt: new Date().toISOString().split('T')[0],
      };
      currentCosts = [newItem, ...costItems];
      setCostItems(currentCosts);
    }

    const updatedOrders = orders.map((o) => {
      if (o.id === orderId) {
        return recalculateOrder(
          {
            ...o,
            unitCost: cost,
            isCostMatched: true,
          },
          settings,
          Boolean(o.isBundleShipping && o.actualShippingCost === 0)
        );
      }
      return o;
    });

    setOrders(processAllOrders(updatedOrders, currentCosts, settings));
  };

  // Excel Batch Import Handler
  const handleImportOrders = (
    newOrders: OrderItem[], 
    importMode: 'append' | 'replace_platform' | 'replace_all'
  ) => {
    let mergedOrders: OrderItem[];
    if (importMode === 'append') {
      mergedOrders = [...newOrders, ...orders];
    } else if (importMode === 'replace_platform') {
      // Extract platforms present in newOrders
      const newPlatforms = new Set(newOrders.map((o) => o.platform));
      // Keep existing orders from other platforms
      const remaining = orders.filter((o) => !newPlatforms.has(o.platform));
      mergedOrders = [...newOrders, ...remaining];
    } else {
      // replace_all: wipe all previous orders
      mergedOrders = newOrders;
    }
    const processed = processAllOrders(mergedOrders, costItems, settings);
    setOrders(processed);
    setCurrentTab('dashboard');
  };

  // Clear all saved orders completely
  const handleClearAllOrders = () => {
    if (confirm('저장된 모든 주문 내역을 삭제하시겠습니까?\n(원가 관리표의 원가 목록은 그대로 유지됩니다)')) {
      setOrders([]);
      localStorage.removeItem(STORAGE_ORDERS_KEY);
      setSelectedDate('all');
      setCurrentTab('dashboard');
    }
  };

  // Reset to Sample Initial Data
  const handleResetSampleData = () => {
    if (confirm('사용자 샘플 데이터(08월 12일, 08월 13일 7개 쇼핑몰 원본)로 복원하시겠습니까?')) {
      setOrders(INITIAL_ORDERS);
      setCostItems(INITIAL_COST_ITEMS);
      setSettings(DEFAULT_SETTINGS);
      setSelectedDate('all');
      setCurrentTab('dashboard');
    }
  };

  // Global Excel Export
  const handleGlobalExport = () => {
    exportOrdersToExcel(
      orders,
      currentTab === 'dashboard' || currentTab === 'cost_master' ? 'all' : currentTab,
      `전체_일일매출및순이익정산_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  // Handle Setting Save
  const handleSaveSettings = (newSettings: SettlementSettings) => {
    setSettings(newSettings);
    setOrders((prev) => processAllOrders(prev, costItems, newSettings));
  };

  return (
    <div className="min-h-screen bg-slate-100/70 flex flex-col font-sans text-slate-900 antialiased selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        availableDates={availableDates}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onExportExcel={handleGlobalExport}
        onResetSampleData={handleResetSampleData}
        onClearAllOrders={handleClearAllOrders}
        unmatchedCostCount={unmatchedCostCount}
        totalOrdersCount={orders.length}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'dashboard' && (
          <DashboardView
            orders={orders}
            selectedDate={selectedDate}
            settings={settings}
            onSelectPlatform={(p) => setCurrentTab(p)}
            onOpenQuickCostModal={(ord) => setQuickCostTargetOrder(ord)}
          />
        )}

        {currentTab === 'cost_master' && (
          <CostMasterView
            costItems={costItems}
            onAddCostItem={handleAddCostItem}
            onUpdateCostItem={handleUpdateCostItem}
            onDeleteCostItem={handleDeleteCostItem}
            onBulkAddCostItems={handleBulkAddCostItems}
            onApplyCostsToOrders={handleApplyCostsToOrders}
          />
        )}

        {currentTab !== 'dashboard' && currentTab !== 'cost_master' && (
          <PlatformTableView
            platform={currentTab}
            orders={orders}
            costItems={costItems}
            settings={settings}
            selectedDate={selectedDate}
            onUpdateOrder={handleUpdateOrder}
            onDeleteOrder={handleDeleteOrder}
            onAddOrder={handleAddOrder}
            onOpenQuickCostModal={(ord) => setQuickCostTargetOrder(ord)}
            onOpenUploadModal={() => setIsUploadOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        <p>
          쇼핑몰 판매자 전용 자동 정산 시스템 · 스마트스토어, 쿠팡, 오늘의집, 자사몰, 11번가, G마켓, 옥션 정산 양식 자동화 지원
        </p>
      </footer>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
      />

      <ExcelUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        costItems={costItems}
        settings={settings}
        onImportOrders={handleImportOrders}
      />

      <QuickCostModal
        order={quickCostTargetOrder}
        onClose={() => setQuickCostTargetOrder(null)}
        onSaveCost={handleQuickCostSave}
      />
    </div>
  );
}
