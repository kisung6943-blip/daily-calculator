import React, { useState, useRef } from 'react';
import { 
  Check, 
  Coins, 
  Database, 
  Download, 
  Edit3, 
  FileSpreadsheet, 
  Filter, 
  Plus, 
  RefreshCw, 
  Search, 
  Sparkles, 
  Tag, 
  Trash2, 
  UploadCloud 
} from 'lucide-react';
import { CostItem, OrderItem } from '../types';
import { formatKRW } from '../utils/calculator';
import { exportCostMasterToExcel, parseCostMasterExcel } from '../utils/excelParser';

interface CostMasterViewProps {
  costItems: CostItem[];
  orders?: OrderItem[];
  onAddCostItem: (item: CostItem) => void;
  onUpdateCostItem: (item: CostItem) => void;
  onDeleteCostItem: (id: string) => void;
  onBulkAddCostItems: (items: CostItem[]) => void;
  onApplyCostsToOrders: () => void;
}

export const CostMasterView: React.FC<CostMasterViewProps> = ({
  costItems,
  orders = [],
  onAddCostItem,
  onUpdateCostItem,
  onDeleteCostItem,
  onBulkAddCostItems,
  onApplyCostsToOrders,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCostValue, setEditCostValue] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk Unmatched Modal State
  const [showUnmatchedModal, setShowUnmatchedModal] = useState(false);
  const [unmatchedInputs, setUnmatchedInputs] = useState<Record<string, number>>({});

  // Add Item Modal/Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newOptionName, setNewOptionName] = useState('기본');
  const [newCost, setNewCost] = useState('');
  const [newCategory, setNewCategory] = useState('주방용품/부품');
  const [newSupplier, setNewSupplier] = useState('');
  const [newMemo, setNewMemo] = useState('');

  // Bulk Paste State
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Extract unique unmatched products from orders
  const unmatchedProducts = React.useMemo(() => {
    const map = new Map<string, { productName: string; optionName: string; avgPrice: number; count: number }>();
    (orders || []).forEach((o) => {
      if (!o.unitCost || o.unitCost === 0 || !o.isCostMatched) {
        const key = `${o.productName.trim()}__${(o.optionName || '기본').trim()}`;
        if (!map.has(key)) {
          map.set(key, {
            productName: o.productName,
            optionName: o.optionName || '기본',
            avgPrice: o.unitPrice || 0,
            count: 1,
          });
        } else {
          const item = map.get(key)!;
          item.count += 1;
        }
      }
    });
    return Array.from(map.values());
  }, [orders]);

  const handleOpenUnmatchedModal = () => {
    const init: Record<string, number> = {};
    unmatchedProducts.forEach((p) => {
      const key = `${p.productName}__${p.optionName}`;
      init[key] = 0;
    });
    setUnmatchedInputs(init);
    setShowUnmatchedModal(true);
  };

  const handleApplyMarginRatio = (ratio: number) => {
    const updated: Record<string, number> = { ...unmatchedInputs };
    unmatchedProducts.forEach((p) => {
      const key = `${p.productName}__${p.optionName}`;
      updated[key] = Math.round(p.avgPrice * ratio);
    });
    setUnmatchedInputs(updated);
  };

  const handleSaveUnmatchedBulk = () => {
    const itemsToAdd: CostItem[] = [];
    const today = new Date().toISOString().split('T')[0];

    unmatchedProducts.forEach((p, idx) => {
      const key = `${p.productName}__${p.optionName}`;
      const costVal = unmatchedInputs[key] || 0;
      if (costVal > 0) {
        itemsToAdd.push({
          id: `cost-bulk-${Date.now()}-${idx}`,
          productName: p.productName,
          optionName: p.optionName,
          cost: costVal,
          category: '일괄입력',
          updatedAt: today,
        });
      }
    });

    if (itemsToAdd.length > 0) {
      onBulkAddCostItems(itemsToAdd);
      alert(`${itemsToAdd.length}개 품목의 원가가 성공적으로 등록되어 정산표에 즉시 반영되었습니다!`);
      setShowUnmatchedModal(false);
    } else {
      alert('원가가 0보다 큰 품목이 없습니다. 원가를 입력해 주세요.');
    }
  };

  // Categories list
  const categories = Array.from(new Set(costItems.map((c) => c.category || '기타'))).filter(Boolean);

  // Filtered cost items
  const filteredItems = costItems.filter((item) => {
    const matchSearch =
      !searchTerm.trim() ||
      item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.optionName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.supplier && item.supplier.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.memo && item.memo.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchCat = selectedCategory === 'all' || (item.category || '기타') === selectedCategory;
    return matchSearch && matchCat;
  });

  // Handle Quick Cost Edit
  const handleStartCostEdit = (item: CostItem) => {
    setEditingId(item.id);
    setEditCostValue(String(item.cost));
  };

  const handleSaveCostEdit = (item: CostItem) => {
    const num = Number(editCostValue.replace(/[^0-9.-]/g, '')) || 0;
    onUpdateCostItem({
      ...item,
      cost: num,
      updatedAt: new Date().toISOString().split('T')[0],
    });
    setEditingId(null);
  };

  // Handle Add Single Item
  const handleAddNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) {
      alert('상품명을 입력해 주세요.');
      return;
    }

    const newItem: CostItem = {
      id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productName: newProductName.trim(),
      optionName: newOptionName.trim() || '기본',
      cost: Number(newCost.replace(/[^0-9.-]/g, '')) || 0,
      category: newCategory.trim() || '일반',
      supplier: newSupplier.trim(),
      memo: newMemo.trim(),
      updatedAt: new Date().toISOString().split('T')[0],
    };

    onAddCostItem(newItem);
    setNewProductName('');
    setNewOptionName('기본');
    setNewCost('');
    setNewSupplier('');
    setNewMemo('');
    setShowAddModal(false);
  };

  // Handle File Upload for Cost Master
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const items = await parseCostMasterExcel(file);
      if (items.length > 0) {
        onBulkAddCostItems(items);
        alert(`원가표에서 ${items.length}개 품목을 성공적으로 등록/업데이트했습니다.`);
      }
    } catch (err: any) {
      alert(`엑셀 파일 읽기 오류: ${err.message || err}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Bulk Paste (Excel copy-paste: 상품명 [tab] 옵션명 [tab] 원가)
  const handleProcessPaste = () => {
    if (!pasteText.trim()) return;

    const lines = pasteText.split('\n');
    const newItems: CostItem[] = [];
    const today = new Date().toISOString().split('T')[0];

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const cols = trimmed.split('\t');
      if (cols.length >= 2) {
        const pName = cols[0].trim();
        let oName = '기본';
        let costVal = 0;

        if (cols.length === 2) {
          // If 2 columns: productName, cost
          costVal = Number(cols[1].replace(/[^0-9.-]/g, '')) || 0;
        } else {
          // If 3+ columns: productName, optionName, cost
          oName = cols[1].trim() || '기본';
          costVal = Number(cols[2].replace(/[^0-9.-]/g, '')) || 0;
        }

        if (pName && !pName.includes('상품명')) {
          newItems.push({
            id: `cost-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
            productName: pName,
            optionName: oName,
            cost: costVal,
            category: '일괄등록',
            updatedAt: today,
          });
        }
      }
    });

    if (newItems.length > 0) {
      onBulkAddCostItems(newItems);
      alert(`${newItems.length}개 품목이 원가표에 추가되었습니다.`);
      setPasteText('');
      setShowPasteModal(false);
    } else {
      alert('유효한 데이터가 감지되지 않았습니다. 엑셀에서 복사한 데이터를 붙여넣어 주세요.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900">
                  상품 및 매입원가 마스터 데이터베이스
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  총 {costItems.length}개 품목 등록됨
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                상품명과 옵션명이 일치하는 주문에 원가가 자동 반영되며, 원가 수정 시 모든 정산표의 순이익이 즉시 재계산됩니다.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {unmatchedProducts.length > 0 && (
              <button
                id="btn-open-unmatched-bulk"
                onClick={handleOpenUnmatchedModal}
                className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-rose-600 to-pink-600 text-white hover:from-rose-700 hover:to-pink-700 shadow-md transition-all animate-pulse cursor-pointer"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                ⚡ 미등록 {unmatchedProducts.length}개 품목 1초 일괄 입력
              </button>
            )}

            <button
              id="btn-reapply-cost"
              onClick={onApplyCostsToOrders}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              정산표 원가 전체 동기화
            </button>

            <button
              id="btn-add-single-cost"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              품목 원가 추가
            </button>

            <button
              id="btn-paste-bulk-cost"
              onClick={() => setShowPasteModal(true)}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-slate-600" />
              대량 텍스트 복사 등록
            </button>

            <button
              id="btn-upload-cost-excel"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 mr-1 text-slate-600" />
              원가표 엑셀 업로드
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />

            <button
              id="btn-export-cost-master"
              onClick={() => exportCostMasterToExcel(costItems)}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              원가표 엑셀 다운로드
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              id="input-search-cost"
              type="text"
              placeholder="상품명, 옵션명, 공급처, 메모 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            전체 ({costItems.length})
          </button>
          {categories.map((cat) => {
            const count = costItems.filter((c) => (c.category || '기타') === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Cost Master Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] scrollbar-thin">
          <table className="min-w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">상품명</th>
                <th className="py-2.5 px-3">옵션명</th>
                <th className="py-2.5 px-3 text-right bg-rose-100 text-rose-950 font-extrabold min-w-[130px]">
                  매입원가 (단가)
                </th>
                <th className="py-2.5 px-3">카테고리</th>
                <th className="py-2.5 px-3">공급처</th>
                <th className="py-2.5 px-3">메모</th>
                <th className="py-2.5 px-3">최종수정일</th>
                <th className="py-2.5 px-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    등록된 원가 항목이 없거나 검색 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-indigo-50/40 transition-colors ${
                      idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-semibold text-slate-900 max-w-[320px]">
                      {item.productName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-[200px]">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                        {item.optionName}
                      </span>
                    </td>
                    {/* Editable Cost Cell */}
                    <td
                      onClick={() => handleStartCostEdit(item)}
                      className="py-2.5 px-3 text-right bg-rose-50/80 hover:bg-rose-100 cursor-pointer font-bold text-rose-900"
                    >
                      {editingId === item.id ? (
                        <div className="flex items-center justify-end space-x-1">
                          <input
                            type="number"
                            value={editCostValue}
                            onChange={(e) => setEditCostValue(e.target.value)}
                            onBlur={() => handleSaveCostEdit(item)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveCostEdit(item)}
                            autoFocus
                            className="w-24 text-right p-1 text-xs border border-indigo-400 rounded bg-white font-bold"
                          />
                          <button
                            onClick={() => handleSaveCostEdit(item)}
                            className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end space-x-1 group">
                          <span>{formatKRW(item.cost, true)}</span>
                          <Edit3 className="w-3 h-3 text-rose-400 opacity-0 group-hover:opacity-100" />
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                        {item.category || '기타'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{item.supplier || '-'}</td>
                    <td className="py-2.5 px-3 text-slate-500">{item.memo || '-'}</td>
                    <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{item.updatedAt}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => onDeleteCostItem(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        title="원가 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Single Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center">
                <Plus className="w-4 h-4 mr-1.5 text-indigo-600" />
                신규 상품 원가 등록
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNewItem} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  상품명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 휘슬러 압력밥솥 호환용 고무패킹"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    옵션명
                  </label>
                  <input
                    type="text"
                    placeholder="예: 1개 22cm (단품일 경우 기본)"
                    value={newOptionName}
                    onChange={(e) => setNewOptionName(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    개당 매입원가(원) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="예: 2000"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    className="w-full text-xs p-2.5 border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-500 font-bold text-rose-900 bg-rose-50/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    카테고리
                  </label>
                  <input
                    type="text"
                    placeholder="예: 주방용품/부품"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    공급처 / 거래처
                  </label>
                  <input
                    type="text"
                    placeholder="예: 국산제조원"
                    value={newSupplier}
                    onChange={(e) => setNewSupplier(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  메모 / 비고
                </label>
                <input
                  type="text"
                  placeholder="특이사항, 단가 변경 이력 등"
                  value={newMemo}
                  onChange={(e) => setNewMemo(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors"
                >
                  원가 등록 및 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center">
                <FileSpreadsheet className="w-4 h-4 mr-1.5 text-indigo-600" />
                엑셀 텍스트 복사 붙여넣기 대량 등록
              </h3>
              <button
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              기존 엑셀 시트에서 <strong>[상품명] [옵션명] [원가]</strong> 열을 드래그하여 복사(Ctrl+C)한 후 아래에 붙여넣기(Ctrl+V) 하시면 한 번에 수십, 수백 개의 품목이 등록됩니다.
            </p>

            <textarea
              rows={8}
              placeholder="예시:
휘슬러 압력밥솥 패킹	22cm	2000
WMF 압력솥 계기패킹	기본	7500
도마 거치대	거치식	7200"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="w-full text-xs font-mono p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex justify-end space-x-2 mt-4">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleProcessPaste}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs"
              >
                일괄 분석 및 등록하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Unmatched Products Fast-Fill Modal */}
      {showUnmatchedModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 animate-in fade-in zoom-in duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center">
                  <Sparkles className="w-5 h-5 mr-2 text-rose-600" />
                  미등록 상품 {unmatchedProducts.length}개 1초 일괄 원가 입력기
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  한 번에 원가를 지정하시면 모든 정산표와 Master DB에 영구 등록되며 엑셀 재업로드 시에도 100% 자동 유지됩니다.
                </p>
              </div>
              <button
                onClick={() => setShowUnmatchedModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 py-3 bg-rose-50/50 px-3 rounded-lg border border-rose-100 my-3">
              <span className="text-xs font-bold text-rose-900 flex items-center">
                ⚡ 빠른 자동 계산 추정 툴:
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleApplyMarginRatio(0.3)}
                  className="px-2.5 py-1 rounded bg-white text-rose-700 font-semibold border border-rose-200 hover:bg-rose-100 text-xs transition-colors cursor-pointer"
                >
                  판매가의 30%로 채우기
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyMarginRatio(0.4)}
                  className="px-2.5 py-1 rounded bg-white text-rose-700 font-semibold border border-rose-200 hover:bg-rose-100 text-xs transition-colors cursor-pointer"
                >
                  판매가의 40%로 채우기
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyMarginRatio(0.5)}
                  className="px-2.5 py-1 rounded bg-white text-rose-700 font-semibold border border-rose-200 hover:bg-rose-100 text-xs transition-colors cursor-pointer"
                >
                  판매가의 50%로 채우기
                </button>
              </div>
            </div>

            {/* Products Table */}
            <div className="flex-1 overflow-y-auto min-h-[250px] border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">상품명</th>
                    <th className="py-2 px-3">옵션명</th>
                    <th className="py-2 px-3 text-right">평균 판매가</th>
                    <th className="py-2 px-3 text-right text-rose-950 font-bold bg-rose-100 min-w-[140px]">
                      개당 매입원가(원)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unmatchedProducts.map((p, idx) => {
                    const key = `${p.productName}__${p.optionName}`;
                    const currentVal = unmatchedInputs[key] || 0;
                    return (
                      <tr key={key} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{p.productName}</td>
                        <td className="py-2 px-3 text-slate-600">{p.optionName}</td>
                        <td className="py-2 px-3 text-right text-slate-500 font-mono">
                          {formatKRW(p.avgPrice)}
                        </td>
                        <td className="py-1.5 px-3 text-right bg-rose-50">
                          <input
                            type="number"
                            value={currentVal || ''}
                            placeholder="원가 입력"
                            onChange={(e) => {
                              const v = Number(e.target.value) || 0;
                              setUnmatchedInputs((prev) => ({ ...prev, [key]: v }));
                            }}
                            className="w-28 text-right p-1.5 text-xs border border-rose-300 rounded font-bold text-rose-900 bg-white focus:ring-2 focus:ring-rose-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-200">
              <span className="text-xs text-slate-500 font-medium">
                원가가 입력된 품목만 자동으로 Master DB에 등록됩니다.
              </span>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setShowUnmatchedModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveUnmatchedBulk}
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 shadow-md transition-colors cursor-pointer"
                >
                  {unmatchedProducts.length}개 품목 원가 1초 일괄 저장하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
