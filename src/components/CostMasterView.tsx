import React, { useState, useRef, useMemo } from 'react';
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
import { CostItem } from '../types';
import { engToKor, formatKRW } from '../utils/calculator';
import { exportCostMasterToExcel, parseCostMasterExcel } from '../utils/excelParser';

interface CostMasterViewProps {
  costItems: CostItem[];
  onAddCostItem: (item: CostItem) => void;
  onUpdateCostItem: (item: CostItem) => void;
  onDeleteCostItem: (id: string) => void;
  onBulkAddCostItems: (items: CostItem[]) => void;
  onApplyCostsToOrders: () => void;
}

export const CostMasterView: React.FC<CostMasterViewProps> = ({
  costItems,
  onAddCostItem,
  onUpdateCostItem,
  onDeleteCostItem,
  onBulkAddCostItems,
  onApplyCostsToOrders,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [autoConvertEng, setAutoConvertEng] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCostValue, setEditCostValue] = useState<string>('');

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const handleScrollTop = () => {
    tableContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollBottom = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ top: tableContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  const handleSearchChange = (val: string) => {
    if (autoConvertEng && /[a-zA-Z]/.test(val)) {
      setSearchTerm(engToKor(val));
    } else {
      setSearchTerm(val);
    }
  };

  // Categories list
  const categories = Array.from(new Set(costItems.map((c) => c.category || '기타'))).filter(Boolean);

  // Filtered cost items with English-to-Korean auto translation (Memoized)
  const korSearchTerm = useMemo(() => engToKor(searchTerm.trim()), [searchTerm]);
  const korSearchTermBase = useMemo(() => korSearchTerm.replace(/[ㄱ-ㅎ]+$/g, ''), [korSearchTerm]);

  const filteredItems = useMemo(() => {
    return costItems.filter((item) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const korTerm = korSearchTerm.toLowerCase();
      const korBase = korSearchTermBase.toLowerCase();

      const matchRaw =
        item.productName.toLowerCase().includes(term) ||
        item.optionName.toLowerCase().includes(term) ||
        (item.supplier && item.supplier.toLowerCase().includes(term)) ||
        (item.memo && item.memo.toLowerCase().includes(term));

      const matchKor =
        korTerm !== term &&
        (item.productName.toLowerCase().includes(korTerm) ||
          item.optionName.toLowerCase().includes(korTerm) ||
          (item.supplier && item.supplier.toLowerCase().includes(korTerm)) ||
          (item.memo && item.memo.toLowerCase().includes(korTerm)));

      const matchKorBase =
        korBase &&
        korBase.length >= 2 &&
        (item.productName.toLowerCase().includes(korBase) ||
          item.optionName.toLowerCase().includes(korBase) ||
          (item.supplier && item.supplier.toLowerCase().includes(korBase)) ||
          (item.memo && item.memo.toLowerCase().includes(korBase)));

      const matchSearch = matchRaw || matchKor || matchKorBase;
      const matchCat = selectedCategory === 'all' || (item.category || '기타') === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [costItems, searchTerm, korSearchTerm, korSearchTermBase, selectedCategory]);

  // Pagination state (Dynamic page size for smooth rendering)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const totalPages = useMemo(() => {
    if (pageSize === 0) return 1;
    return Math.max(1, Math.ceil(filteredItems.length / pageSize));
  }, [filteredItems.length, pageSize]);

  const paginatedItems = useMemo(() => {
    if (pageSize === 0) return filteredItems;
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

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
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
        {/* Top Row: Expanded Full-Width Search Input & Quick Tools */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative shrink-0" style={{ width: '600px', minWidth: '450px', maxWidth: '100%', flexShrink: 0 }}>
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              id="input-search-cost"
              type="text"
              inputMode="text"
              lang="ko"
              autoCapitalize="off"
              autoCorrect="off"
              style={{ imeMode: 'active' as any, width: '100%', minWidth: '100%' }}
              placeholder="상품명, 옵션명, 공급처, 메모 검색 (영타 입력 시 한글 자동 변환)..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
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
          <label className="flex items-center space-x-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-2 rounded-lg cursor-pointer whitespace-nowrap shrink-0">
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
              className="inline-flex items-center px-2.5 py-2 rounded-lg text-xs font-bold bg-white text-indigo-700 border border-slate-300 hover:bg-indigo-50 shadow-xs cursor-pointer"
              title="테이블 맨 위로 스크롤합니다"
            >
              ▲ 맨 위로
            </button>
            <button
              type="button"
              onClick={handleScrollBottom}
              className="inline-flex items-center px-2.5 py-2 rounded-lg text-xs font-bold bg-white text-indigo-700 border border-slate-300 hover:bg-indigo-50 shadow-xs cursor-pointer"
              title="테이블 맨 아래로 스크롤합니다"
            >
              ▼ 맨 아래로
            </button>
          </div>
        </div>

        {/* Bottom Row: Category Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none text-xs pt-2 border-t border-slate-100">
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
        <div ref={tableContainerRef} className="overflow-auto max-h-[calc(100vh-280px)] min-h-[350px] scrollbar-thin">
          <table className="min-w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 bg-slate-100 w-[340px] min-w-[340px] max-w-[340px] border-r border-slate-300" style={{ position: 'sticky', left: 0, top: 0, zIndex: 40 }}>상품명 📌</th>
                <th className="py-2.5 px-3 bg-slate-100 w-[150px] min-w-[150px] max-w-[150px] border-r-2 border-slate-300 shadow-xs" style={{ position: 'sticky', left: 340, top: 0, zIndex: 40 }}>옵션명 📌</th>
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
                paginatedItems.map((item, idx) => {
                  const cellBg = idx % 2 === 1 ? 'bg-slate-50' : 'bg-white';
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-indigo-50/50 ${cellBg}`}
                    >
                      <td className={`py-2.5 px-4 font-semibold text-slate-900 w-[340px] min-w-[340px] max-w-[340px] border-r border-slate-300 ${cellBg}`} style={{ position: 'sticky', left: 0, zIndex: 20 }}>
                        {item.productName}
                      </td>
                      <td className={`py-2.5 px-3 text-slate-600 w-[150px] min-w-[150px] max-w-[150px] border-r-2 border-slate-300 shadow-2xs ${cellBg}`} style={{ position: 'sticky', left: 340, zIndex: 20 }}>
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
                );
              })
            )}
            </tbody>
          </table>
        </div>
        {/* Pagination & Page Size Control Bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-medium">
          <div className="flex items-center space-x-3">
            <span className="text-slate-600 font-medium">
              {pageSize > 0 ? (
                <>총 <strong>{filteredItems.length}</strong>개 품목 중 <strong>{filteredItems.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, filteredItems.length)}</strong>개 표시 중</>
              ) : (
                <>총 <strong>{filteredItems.length}</strong>개 품목 전체 표시 중</>
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
                <option value={30}>30개씩</option>
                <option value={50}>50개씩</option>
                <option value={100}>100개씩</option>
                <option value={0}>전체보기</option>
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
    </div>
  );
};
