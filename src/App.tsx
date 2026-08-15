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
import { processAllOrders, recalculateOrder } from './utils/calculator';
import { exportOrdersToExcel } from './utils/excelParser';

const STORAGE_ORDERS_KEY = 'seller_settlement_orders_v1';
const STORAGE_COSTS_KEY = 'seller_settlement_costs_v1';
const STORAGE_SETTINGS_KEY = 'seller_settlement_settings_v1';
const STORAGE_AD_SPENDS_KEY = 'seller_settlement_ad_spends_v1';

export default function App() {
  // 1. Core State with LocalStorage Persistence
  const [orders, setOrders] = useState<OrderItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ORDERS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_ORDERS;
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
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SETTINGS;
  });

  const [adSpends, setAdSpends] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_AD_SPENDS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {};
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_AD_SPENDS_KEY, JSON.stringify(adSpends));
    } catch (e) {}
  }, [adSpends]);

  const handleUpdateAdSpend = (platform: PlatformType, date: string, amount: number) => {
    const key = `${platform}__${date}`;
    setAdSpends((prev) => ({
      ...prev,
      [key]: Math.max(0, amount),
    }));
  };

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
    let currentCosts = [...costItems];
    if (updated.unitCost && updated.unitCost > 0 && updated.productName) {
      const pNorm = updated.productName.trim().toLowerCase();
      const oNorm = (updated.optionName || '').trim().toLowerCase();
      const existingIdx = currentCosts.findIndex(
        (c) => c.productName.trim().toLowerCase() === pNorm && (c.optionName || '').trim().toLowerCase() === oNorm
      );
      if (existingIdx >= 0) {
        currentCosts[existingIdx] = {
          ...currentCosts[existingIdx],
          cost: updated.unitCost,
          updatedAt: new Date().toISOString().split('T')[0],
        };
      } else {
        currentCosts = [
          {
            id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            productName: updated.productName,
            optionName: updated.optionName || '기본',
            cost: updated.unitCost,
            category: '주방용품/부품',
            updatedAt: new Date().toISOString().split('T')[0],
          },
          ...currentCosts,
        ];
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
    _saveToMaster: boolean,
    costItemData?: Partial<CostItem>
  ) => {
    let currentCosts = [...costItems];
    const targetOrder = orders.find((o) => o.id === orderId);
    const pName = costItemData?.productName || targetOrder?.productName || '';
    const oName = costItemData?.optionName || targetOrder?.optionName || '기본';

    if (pName && cost > 0) {
      const pNorm = pName.trim().toLowerCase();
      const oNorm = oName.trim().toLowerCase();
      const existingIdx = currentCosts.findIndex(
        (c) => c.productName.trim().toLowerCase() === pNorm && (c.optionName || '').trim().toLowerCase() === oNorm
      );
      if (existingIdx >= 0) {
        currentCosts[existingIdx] = {
          ...currentCosts[existingIdx],
          cost,
          updatedAt: new Date().toISOString().split('T')[0],
        };
      } else {
        currentCosts = [
          {
            id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            productName: pName,
            optionName: oName,
            cost,
            category: costItemData?.category || '주방용품/부품',
            updatedAt: new Date().toISOString().split('T')[0],
          },
          ...currentCosts,
        ];
      }
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
  const handleImportOrders = (newOrders: OrderItem[], appendMode: boolean) => {
    // 1. Auto-preserve all previously entered order costs into costItems DB
    let currentCosts = [...costItems];
    const existingCostKeys = new Set(
      currentCosts.map((c) => `${c.productName.trim().toLowerCase()}__${(c.optionName || '').trim().toLowerCase()}`)
    );

    orders.forEach((ord) => {
      if (ord.unitCost > 0 && ord.productName) {
        const key = `${ord.productName.trim().toLowerCase()}__${(ord.optionName || '').trim().toLowerCase()}`;
        if (!existingCostKeys.has(key)) {
          existingCostKeys.add(key);
          currentCosts.push({
            id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            productName: ord.productName,
            optionName: ord.optionName || '기본',
            cost: ord.unitCost,
            category: '주방용품/부품',
            updatedAt: new Date().toISOString().split('T')[0],
          });
        }
      }
    });

    setCostItems(currentCosts);

    let mergedOrders: OrderItem[];
    if (appendMode) {
      mergedOrders = [...newOrders, ...orders];
    } else {
      mergedOrders = newOrders;
    }
    const processed = processAllOrders(mergedOrders, currentCosts, settings);
    setOrders(processed);
    setCurrentTab('dashboard');
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

  // JSON Data Backup Export
  const handleExportBackup = () => {
    const mappedOrders = orders.map((o: any) => ({
      ...o,
      salesAmount: Number(o.salesAmount ?? o.totalPrice ?? (o.unitPrice ? o.unitPrice * (o.quantity || 1) : 0)) || 0,
    }));
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      orders: mappedOrders,
      costItems,
      costMaster: costItems,
      settings,
      adSpends,
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backupData, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `daily_calculator_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // JSON Data Backup Import / Restore
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        let restoredCount = 0;

        const importedCosts = parsed.costItems || parsed.costMaster;
        if (importedCosts && Array.isArray(importedCosts)) {
          setCostItems(importedCosts);
          restoredCount++;
        }
        if (parsed.orders && Array.isArray(parsed.orders)) {
          const normOrders = parsed.orders.map((o: any) => ({
            ...o,
            salesAmount: Number(o.salesAmount ?? o.totalPrice ?? (o.unitPrice ? o.unitPrice * (o.quantity || 1) : 0)) || 0,
          }));
          setOrders(processAllOrders(normOrders, importedCosts || costItems, settings));
          restoredCount++;
        }
        if (parsed.settings) {
          setSettings(parsed.settings);
          restoredCount++;
        }
        if (parsed.adSpends) {
          setAdSpends(parsed.adSpends);
          restoredCount++;
        }

        if (restoredCount > 0) {
          alert('백업 데이터(주문내역, 원가표, 설정값, 광고비)를 성공적으로 복원했습니다!');
        } else {
          alert('백업 파일에서 올바른 데이터를 찾을 수 없습니다.');
        }
      } catch (err) {
        alert('백업 파일을 읽는 중 오류가 발생했습니다. 올바른 .json 파일인지 확인해 주세요.');
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
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
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        unmatchedCostCount={unmatchedCostCount}
        totalOrdersCount={orders.length}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-[99%] xl:max-w-[1700px] w-full mx-auto px-2 py-2">
        {currentTab === 'dashboard' && (
          <DashboardView
            orders={orders}
            selectedDate={selectedDate}
            settings={settings}
            adSpends={adSpends}
            onSelectPlatform={(p) => setCurrentTab(p)}
            onOpenQuickCostModal={(ord) => setQuickCostTargetOrder(ord)}
          />
        )}

        {currentTab === 'cost_master' && (
          <CostMasterView
            costItems={costItems}
            orders={orders}
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
            adSpends={adSpends}
            onUpdateOrder={handleUpdateOrder}
            onDeleteOrder={handleDeleteOrder}
            onAddOrder={handleAddOrder}
            onOpenQuickCostModal={(ord) => setQuickCostTargetOrder(ord)}
            onOpenUploadModal={() => setIsUploadOpen(true)}
            onUpdateAdSpend={handleUpdateAdSpend}
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
