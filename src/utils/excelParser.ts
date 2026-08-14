import * as XLSX from 'xlsx';
import { CostItem, OrderItem, PlatformType, SettlementSettings } from '../types';
import { recalculateOrder } from './calculator';

/**
 * Platform Header Keywords for Auto-Detection
 */
const PLATFORM_HEADER_MAP: Record<PlatformType, string[]> = {
  smartstore: ['상품주문번호', '스마트스토어', '네이버페이', '지식쇼핑', '결산예정액', '수수료합', '스토어팜', '정산예정금액'],
  coupang: ['옵션ID', '쿠팡', '배송비종류', 'Wing', '총상품구매금액'],
  ohouse: ['오늘의집', '정산가(공급가)', '판매금액3', '정산금액'],
  homepage: ['총결제금액', '총배송비', '옵션+판매', '자사몰', '홈페이지'],
  elevenst: ['11번가', '주문번호', '주문금액', '정산가', '수수료2'],
  gmarket: ['G마켓', '지마켓', 'ESM', '판매자쿠폰'],
  auction: ['옥션', 'AUCTION', 'ESM Plus'],
};

/**
 * Detect platform from header names
 */
export function detectPlatformFromHeaders(headers: string[]): PlatformType {
  const safeHeaders = (headers || []).map((h) => String(h ?? '').toLowerCase());
  const joined = safeHeaders.join(' ');

  if (joined.includes('지식쇼핑') || joined.includes('네이버') || joined.includes('스마트스토어') || joined.includes('스토어팜') || joined.includes('상품주문번호')) {
    return 'smartstore';
  }
  if (joined.includes('쿠팡') || joined.includes('배송비종류') || joined.includes('wing')) {
    return 'coupang';
  }
  if (joined.includes('오늘의집') || joined.includes('정산가(공급가)')) {
    return 'ohouse';
  }
  if (joined.includes('홈페이지') || joined.includes('총결제금액') || joined.includes('옵션+판매')) {
    return 'homepage';
  }
  if (joined.includes('11번가')) {
    return 'elevenst';
  }
  if (joined.includes('g마켓') || joined.includes('지마켓')) {
    return 'gmarket';
  }
  if (joined.includes('옥션') || joined.includes('auction')) {
    return 'auction';
  }

  return 'smartstore'; // fallback
}

/**
 * Format raw date string into YYYY-MM-DD
 */
function cleanDateStr(rawDate: any): string {
  if (!rawDate) return new Date().toISOString().split('T')[0];
  const str = String(rawDate).trim();
  const dateMatch = str.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (dateMatch) {
    const yyyy = dateMatch[1];
    const mm = dateMatch[2].padStart(2, '0');
    const dd = dateMatch[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return str.slice(0, 10) || new Date().toISOString().split('T')[0];
}

/**
 * Parse an Excel or CSV file buffer into OrderItem array
 */
export async function parseExcelOrders(
  file: File,
  forcedPlatform?: PlatformType,
  settings?: SettlementSettings
): Promise<{ orders: OrderItem[]; detectedPlatform: PlatformType }> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to array of arrays
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('엑셀 파일에 데이터가 없습니다.');
  }

  // Find the header row safely (skip single-cell title rows)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(20, rawRows.length); i++) {
    const row = rawRows[i];
    if (!row || !Array.isArray(row)) continue;
    const safeCells = Array.from(row).map((c) => String(c ?? '').replace(/\s+/g, '').toLowerCase());
    const nonEmptyCells = safeCells.filter((c) => c.length > 0);

    // Skip single-cell title rows
    if (nonEmptyCells.length < 2) continue;

    const hasProduct = safeCells.some((c) => c.includes('상품명') || c.includes('상품') || c.includes('품목'));
    const hasOrder = safeCells.some(
      (c) =>
        c.includes('주문번호') ||
        c.includes('상품주문번호') ||
        c.includes('주문') ||
        c.includes('수량') ||
        c.includes('정산') ||
        c.includes('수취인') ||
        c.includes('결제')
    );

    if (hasProduct && hasOrder) {
      headerRowIndex = i;
      break;
    }
  }

  // Fallback search if strict match failed
  if (headerRowIndex === -1) {
    for (let i = 0; i < Math.min(20, rawRows.length); i++) {
      const row = rawRows[i];
      if (!row || !Array.isArray(row)) continue;
      const safeCells = Array.from(row).map((c) => String(c ?? '').trim());
      if (safeCells.filter(Boolean).length >= 2) {
        const joined = safeCells.join(' ');
        if (joined.includes('상품명') || joined.includes('주문') || joined.includes('판매') || joined.includes('수량')) {
          headerRowIndex = i;
          break;
        }
      }
    }
  }

  if (headerRowIndex === -1) headerRowIndex = 0;

  const rawHeaders = Array.from(rawRows[headerRowIndex] || []).map((h) => String(h ?? '').trim());
  const platform = forcedPlatform || detectPlatformFromHeaders(rawHeaders);

  // Map header column indices safely against undefined/hole items, spaces, and exclusions
  const getColIdx = (keywords: string[], excludeKeywords: string[] = []): number => {
    return rawHeaders.findIndex((h) => {
      if (typeof h !== 'string' || !h.trim()) return false;
      const cleanH = h.replace(/\s+/g, '').toLowerCase();

      // Skip if header matches any exclusion keyword
      if (excludeKeywords.some((ex) => cleanH.includes(ex.replace(/\s+/g, '').toLowerCase()))) {
        return false;
      }

      return keywords.some((kw) => cleanH.includes(kw.replace(/\s+/g, '').toLowerCase()));
    });
  };

  const dateIdx = getColIdx(['날짜', '주문일시', '결제일시', '주문일자', '결제일자', '주문일', '결제일', '발송일', '일자']);
  const orderNoIdx = getColIdx(
    ['상품주문번호', '주문번호', '주문ID', 'OrderNo', '주문 번호', '구매번호', '결제번호'],
    ['상품번호', '상품코드']
  );
  const productNoIdx = getColIdx(
    ['상품번호', '상품코드', '옵션ID', '품목코드', '상품 ID'],
    ['상품명', '주문번호', '상품주문번호', '상품결제금액']
  );
  const productIdx = getColIdx(
    ['상품명', '품목명', '주문상품명', '주문상품', '상품 이름', '품목'],
    ['상품번호', '상품주문번호', '상품코드', '옵션ID', '상품금액', '상품결제금액', '상품단가', '수량']
  );
  const optionIdx = getColIdx(['옵션정보', '선택옵션', '옵션명', '옵션 세부', '옵션'], ['옵션id']);
  const qtyIdx = getColIdx(['수량', '구매수량', '수량(개)', '구매 수량']);
  const recipientIdx = getColIdx(['수취인명', '수취인', '수령인', '구매자명', '구매자', '고객명', '받는사람', '받는분']);
  const priceIdx = getColIdx(
    ['상품결제금액', '결제금액', '판매가', '판매금액', '주문금액', '상품금액', '총상품구매금액', '공급가', '총결제금액'],
    ['수수료', '단가']
  );
  const unitPriceIdx = getColIdx(['개별단가', '단가', '옵션+판매', '상품단가'], ['원가']);
  const shippingIdx = getColIdx(
    ['배송비 합계', '배송비 금액', '배송비금액', '총배송비', '총 배송비', '고객배송비', '배송비결제', '배송비2', '배송비'],
    ['배송비 형태', '배송비유형', '배송비종류', '배송비구분', '배송비조건', '배송조건', '배송비 속성', '배송비 결제방식', '택배사']
  );
  const feeIdx = getColIdx(
    ['결제수수료', '수수료합계', '수수료', '수수료1', '수수료합', '중개수수료', '네이버페이 수수료'],
    ['매출연동', '수수료율', '수수료%', '지식']
  );
  const kFeeIdx = getColIdx(['매출연동 수수료', '매출연동', '지식쇼핑 수수료', '지식쇼핑', '지식', '쇼핑수수료'], ['수수료율', '수수료%']);
  const settlementIdx = getColIdx(
    ['정산예정금액', '정산가', '정산금액', '정산금', '결산예정', '정산 예정 금액', '정산'],
    ['정산일', '정산주기', '정산상태']
  );
  const costIdx = getColIdx(['매입원가', '개당원가', '원가합계', '원가']);
  const packagingIdx = getColIdx(['포장비', '포장', '포장재비', '포장박스']);
  const actualShipIdx = getColIdx(['실배송비', '실택배비', '실제배송비', '택배비2'], ['고객배송비', '배송비 형태', '수취인']);

  const parsedOrders: OrderItem[] = [];
  const activeSettings = settings || {
    defaultPackagingCost: 500,
    defaultActualShippingCost: 1900,
    defaultIncomeTaxRate: 10,
    vatCalculationMethod: 'simple10',
    autoBundleShipping: true,
    bundleOnlyFirstPackageCost: false,
    coupangDefaultFee: 13,
    coupangRiceFee: 6,
    homepageFee: 3.85,
    smartstoreBaseFee: 3.74,
    smartstoreKnowledgeFee: 2.0,
    ohouseDefaultFee: 16,
    elevenstDefaultFee: 13,
    gmarketDefaultFee: 13,
    auctionDefaultFee: 13,
  };

  const todayStr = new Date().toISOString().split('T')[0];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const safeRow = Array.from(row);

    // Check if row is mostly empty or summary row
    const rowText = safeRow.map((c) => String(c ?? '')).join(' ').trim();
    if (!rowText || rowText.includes('합계') || rowText.includes('총계')) continue;

    const getVal = (idx: number) => (idx >= 0 && idx < safeRow.length && safeRow[idx] !== undefined && safeRow[idx] !== null) ? safeRow[idx] : undefined;

    let rawProductName = getVal(productIdx);
    let productName = rawProductName !== undefined ? String(rawProductName).trim() : '';

    // Fallback: if productName is empty or pure numbers (e.g. 6559017204), find text cell in row
    if ((!productName || /^\d+$/.test(productName)) && safeRow.length > 0) {
      for (let c = 0; c < safeRow.length; c++) {
        if (c === dateIdx || c === orderNoIdx || c === productNoIdx || c === qtyIdx || c === priceIdx || c === recipientIdx) continue;
        const val = safeRow[c];
        if (val !== undefined && val !== null) {
          const strVal = String(val).trim();
          if (strVal.length > 1 && /[가-힣a-zA-Z]/.test(strVal)) {
            productName = strVal;
            break;
          }
        }
      }
    }

    if (!productName) continue;

    const orderDateRaw = getVal(dateIdx) !== undefined ? cleanDateStr(getVal(dateIdx)) : todayStr;

    const rawOrderNo = getVal(orderNoIdx);
    const orderNumber = (rawOrderNo !== undefined && rawOrderNo !== null && String(rawOrderNo).trim() !== '')
      ? String(rawOrderNo).trim()
      : `ORD-${r}`;

    const rawProductNo = getVal(productNoIdx);
    const productNumber = (rawProductNo !== undefined && rawProductNo !== null) ? String(rawProductNo).trim() : '';

    const optionName = getVal(optionIdx) !== undefined ? String(getVal(optionIdx)).trim() : '기본';
    const quantity = Math.max(1, Number(getVal(qtyIdx) !== undefined ? String(getVal(qtyIdx)).replace(/[^0-9.-]/g, '') : 1) || 1);
    const recipient = getVal(recipientIdx) !== undefined ? String(getVal(recipientIdx)).trim() : '고객';

    // Pricing
    const pVal = getVal(priceIdx);
    let rawPrice = pVal !== undefined ? Number(String(pVal).replace(/[^0-9.-]/g, '')) || 0 : 0;

    const upVal = getVal(unitPriceIdx);
    let rawUnitPrice = upVal !== undefined ? Number(String(upVal).replace(/[^0-9.-]/g, '')) || 0 : 0;

    if (rawPrice === 0 && rawUnitPrice > 0) {
      rawPrice = rawUnitPrice * quantity;
    } else if (rawPrice > 0 && rawUnitPrice === 0) {
      rawUnitPrice = Math.round(rawPrice / quantity);
    }

    // Shipping fee
    let buyerShipping = 0;
    const sVal = getVal(shippingIdx);
    if (sVal !== undefined && sVal !== null) {
      const shipStr = String(sVal).trim();
      if (shipStr === '무료' || shipStr === '0' || shipStr === '무료배송') {
        buyerShipping = 0;
      } else {
        const numVal = Number(shipStr.replace(/[^0-9.-]/g, ''));
        buyerShipping = isNaN(numVal) ? 0 : numVal;
      }
    }

    // Fees & Settlement if available in raw sheet
    const fVal = getVal(feeIdx);
    const rawFee = fVal !== undefined && fVal !== null && String(fVal).trim() !== '' ? Math.abs(Number(String(fVal).replace(/[^0-9.-]/g, '')) || 0) : undefined;

    const kVal = getVal(kFeeIdx);
    const rawKFee = kVal !== undefined && kVal !== null && String(kVal).trim() !== '' ? Math.abs(Number(String(kVal).replace(/[^0-9.-]/g, '')) || 0) : undefined;

    const setVal = getVal(settlementIdx);
    const rawSettlement = setVal !== undefined && setVal !== null && String(setVal).trim() !== '' ? Math.abs(Number(String(setVal).replace(/[^0-9.-]/g, '')) || 0) : undefined;

    const cVal = getVal(costIdx);
    const rawCost = cVal !== undefined && cVal !== null && String(cVal).trim() !== '' ? Math.abs(Number(String(cVal).replace(/[^0-9.-]/g, '')) || 0) : undefined;

    const pkgVal = getVal(packagingIdx);
    const rawPackaging = pkgVal !== undefined && pkgVal !== null && String(pkgVal).trim() !== '' ? Math.abs(Number(String(pkgVal).replace(/[^0-9.-]/g, '')) || 0) : undefined;

    const shipCostVal = getVal(actualShipIdx);
    const rawActualShip = shipCostVal !== undefined && shipCostVal !== null && String(shipCostVal).trim() !== '' ? Math.abs(Number(String(shipCostVal).replace(/[^0-9.-]/g, '')) || 0) : undefined;

    const orderObj: Partial<OrderItem> = {
      platform,
      orderDate: orderDateRaw,
      orderNumber,
      productNumber,
      productName,
      optionName,
      quantity,
      recipient,
      unitPrice: rawUnitPrice || rawPrice,
      totalPrice: rawPrice || rawUnitPrice * quantity,
      buyerShippingFee: buyerShipping,
      feeAmount: rawFee,
      knowledgeShoppingFee: rawKFee,
      settlementAmount: rawSettlement,
      unitCost: rawCost || 0,
      packagingCost: rawPackaging,
      actualShippingCost: rawActualShip,
      isCostMatched: (rawCost || 0) > 0,
    };

    const calculated = recalculateOrder(orderObj, activeSettings, false);
    parsedOrders.push(calculated);
  }

  return { orders: parsedOrders, detectedPlatform: platform };
}

/**
 * Export Settlement Orders to Excel matching Korean Channel Formats
 */
export function exportOrdersToExcel(orders: OrderItem[], platform?: PlatformType | 'all', fileName?: string): void {
  const wb = XLSX.utils.book_new();

  const platformGroups: { title: string; items: OrderItem[] }[] = [];

  if (platform && platform !== 'all') {
    platformGroups.push({ title: platform, items: orders.filter((o) => o.platform === platform) });
  } else {
    // Export multi-sheets or all in one
    platformGroups.push({ title: '전체통합_정산표', items: orders });
  }

  platformGroups.forEach((group) => {
    const rows = group.items.map((o) => ({
      '날짜': o.orderDate,
      '플랫폼': o.platform,
      '주문번호': o.orderNumber,
      '상품번호': o.productNumber || '',
      '상품명': o.productName,
      '옵션명': o.optionName,
      '수량': o.quantity,
      '판매가(단가)': o.unitPrice,
      '판매금액(합계)': o.totalPrice,
      '수취인': o.recipient,
      '고객배송비': o.buyerShippingFee,
      '수수료': o.feeAmount,
      '지식쇼핑수수료': o.knowledgeShoppingFee || 0,
      '정산금액(정산가)': o.settlementAmount,
      '개당원가': o.unitCost,
      '원가합계': o.totalCost,
      '포장비': o.packagingCost,
      '실택배비': o.actualShippingCost,
      '합배송여부': o.isBundleShipping ? '합배송' : '단독',
      '순익(영업이익)': o.grossProfit,
      '부가세제외순익': o.vatDeductedProfit,
      '부가세': o.vatAmount,
      '종합소득세': o.incomeTax,
      '최종순수익': o.netProfit,
      '마진율(%)': `${o.marginRate}%`,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-fit column widths
    const colWidths = [
      { wch: 12 }, // 날짜
      { wch: 10 }, // 플랫폼
      { wch: 16 }, // 주문번호
      { wch: 12 }, // 상품번호
      { wch: 35 }, // 상품명
      { wch: 20 }, // 옵션명
      { wch: 6 },  // 수량
      { wch: 12 }, // 판매가
      { wch: 12 }, // 판매금액
      { wch: 10 }, // 수취인
      { wch: 10 }, // 고객배송비
      { wch: 10 }, // 수수료
      { wch: 12 }, // 지식쇼핑
      { wch: 12 }, // 정산금액
      { wch: 10 }, // 개당원가
      { wch: 10 }, // 원가합계
      { wch: 8 },  // 포장비
      { wch: 8 },  // 실택배비
      { wch: 10 }, // 합배송
      { wch: 12 }, // 순익
      { wch: 14 }, // 부가세제외순익
      { wch: 10 }, // 부가세
      { wch: 12 }, // 종합소득세
      { wch: 12 }, // 최종순수익
      { wch: 10 }, // 마진율
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, group.title.slice(0, 31));
  });

  const exportName = fileName || `쇼핑몰_매출정산_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, exportName);
}

/**
 * Export Cost Master to Excel
 */
export function exportCostMasterToExcel(costItems: CostItem[]): void {
  const wb = XLSX.utils.book_new();
  const rows = costItems.map((c) => ({
    '상품명': c.productName,
    '옵션명': c.optionName,
    '매입원가': c.cost,
    '카테고리': c.category || '',
    '공급처': c.supplier || '',
    '메모': c.memo || '',
    '최종수정일': c.updatedAt,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 40 }, // 상품명
    { wch: 25 }, // 옵션명
    { wch: 12 }, // 매입원가
    { wch: 15 }, // 카테고리
    { wch: 15 }, // 공급처
    { wch: 20 }, // 메모
    { wch: 12 }, // 최종수정일
  ];

  XLSX.utils.book_append_sheet(wb, ws, '원가관리마스터');
  XLSX.writeFile(wb, `원가관리표_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Parse Cost Master Excel
 */
export async function parseCostMasterExcel(file: File): Promise<CostItem[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

  if (!rawRows || rawRows.length === 0) throw new Error('파일에 데이터가 없습니다.');

  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const row = rawRows[i];
    if (!row || !Array.isArray(row)) continue;
    const rowStr = Array.from(row).map((c) => String(c ?? '').trim()).join(' ');
    if (rowStr.includes('상품명') || rowStr.includes('원가')) {
      headerIdx = i;
      break;
    }
  }

  const headers = Array.from(rawRows[headerIdx] || []).map((h) => String(h ?? '').trim());
  const pIdx = headers.findIndex((h) => typeof h === 'string' && h.includes('상품명'));
  const oIdx = headers.findIndex((h) => typeof h === 'string' && h.includes('옵션'));
  const cIdx = headers.findIndex((h) => typeof h === 'string' && (h.includes('원가') || h.includes('단가') || h.includes('매입')));
  const catIdx = headers.findIndex((h) => typeof h === 'string' && (h.includes('카테고리') || h.includes('분류')));
  const sIdx = headers.findIndex((h) => typeof h === 'string' && (h.includes('공급처') || h.includes('거래처')));
  const mIdx = headers.findIndex((h) => typeof h === 'string' && (h.includes('메모') || h.includes('비고')));

  const items: CostItem[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (let r = headerIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const safeRow = Array.from(row);
    const getVal = (idx: number) => (idx >= 0 && idx < safeRow.length && safeRow[idx] !== undefined && safeRow[idx] !== null) ? safeRow[idx] : undefined;

    const productName = getVal(pIdx) !== undefined ? String(getVal(pIdx)).trim() : '';
    if (!productName) continue;

    const optionName = getVal(oIdx) !== undefined ? String(getVal(oIdx)).trim() : '기본';
    const cost = Number(getVal(cIdx) !== undefined ? String(getVal(cIdx)).replace(/[^0-9.-]/g, '') : 0) || 0;
    const category = getVal(catIdx) !== undefined ? String(getVal(catIdx)).trim() : '';
    const supplier = getVal(sIdx) !== undefined ? String(getVal(sIdx)).trim() : '';
    const memo = getVal(mIdx) !== undefined ? String(getVal(mIdx)).trim() : '';

    items.push({
      id: `cost-${Date.now()}-${r}-${Math.random().toString(36).substr(2, 4)}`,
      productName,
      optionName,
      cost,
      category,
      supplier,
      memo,
      updatedAt: today,
    });
  }

  return items;
}

