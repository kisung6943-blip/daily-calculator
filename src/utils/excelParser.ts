import * as XLSX from 'xlsx';
import { CostItem, OrderItem, PlatformType, SettlementSettings } from '../types';
import { recalculateOrder } from './calculator';

/**
 * Platform Header Keywords for Auto-Detection
 */
const PLATFORM_HEADER_MAP: Record<PlatformType, string[]> = {
  smartstore: ['상품주문번호', '스마트스토어', '네이버페이', '지식쇼핑', '결산예정액', '수수료합', '스토어팜'],
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
  const joined = headers.join(' ').toLowerCase();

  if (joined.includes('지식쇼핑') || joined.includes('네이버') || joined.includes('스마트스토어') || joined.includes('스토어팜')) {
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
 * Parse an Excel or CSV file buffer into OrderItem array
 */
export async function parseExcelOrders(
  file: File,
  forcedPlatform?: PlatformType,
  settings?: SettlementSettings,
  forcedDate?: string
): Promise<{ orders: OrderItem[]; detectedPlatform: PlatformType }> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to array of arrays
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (rawRows.length === 0) {
    throw new Error('엑셀 파일에 데이터가 없습니다.');
  }

  // Find the header row (typically row 0 or 1 where key words like '상품명', '주문번호', '수량' exist)
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const rowStr = rawRows[i].map((c) => String(c || '').trim()).join(' ');
    if (rowStr.includes('상품명') || rowStr.includes('주문') || rowStr.includes('판매') || rowStr.includes('수량')) {
      headerRowIndex = i;
      break;
    }
  }

  const rawHeaders = rawRows[headerRowIndex].map((h) => String(h || '').trim());
  const platform = forcedPlatform || detectPlatformFromHeaders(rawHeaders);

  // Map header column indices
  const getColIdx = (keywords: string[]): number => {
    return rawHeaders.findIndex((h) => keywords.some((kw) => h.includes(kw)));
  };

  const dateIdx = getColIdx(['날짜', '주문일', '일자', '결제일', '정산일']);
  const orderNoIdx = getColIdx(['주문번호', '상품주문번호', '주문ID', 'OrderNo']);
  const productNoIdx = getColIdx(['상품번호', '상품코드', '옵션ID']);
  const productIdx = getColIdx(['상품명', '상품명2', '품목명', '주문상품']);
  const optionIdx = getColIdx(['옵션', '옵션명', '옵션정보', '선택옵션']);
  const qtyIdx = getColIdx(['수량', '구매수량', '수']);
  const recipientIdx = getColIdx(['수취인', '수령인', '구매자', '고객명', '받는사람']);
  const priceIdx = getColIdx(['판매가', '판매금액', '주문금액', '상품금액', '총상품구매금액', '공급가']);
  const unitPriceIdx = getColIdx(['단가', '개별단가', '옵션+판매']);
  const shippingIdx = getColIdx(['배송비', '택배비', '총배송비', '배송비결제', '배송비2']);
  const feeIdx = getColIdx(['수수료', '수수료1', '수수료합', '중개수수료']);
  const kFeeIdx = getColIdx(['지식쇼핑', '매출연동']);
  const settlementIdx = getColIdx(['정산가', '정산금액', '결산예정', '공급가']);
  const costIdx = getColIdx(['원가', '매입원가', '개당원가']);

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
    if (!row || row.length === 0) continue;

    // Check if row is mostly empty or summary row
    const rowText = row.join(' ').trim();
    if (!rowText || rowText.includes('합계') || rowText.includes('총계')) continue;

    const productName = productIdx >= 0 && row[productIdx] ? String(row[productIdx]).trim() : '';
    if (!productName) continue;

    let orderDateRaw = forcedDate;
    if (!orderDateRaw) {
      const rawDateVal = dateIdx >= 0 && row[dateIdx] ? String(row[dateIdx]).trim() : '';
      if (rawDateVal) {
        const cleaned = rawDateVal.replace(/[^0-9]/g, '');
        if (cleaned.length >= 8) {
          orderDateRaw = `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`;
        } else {
          orderDateRaw = rawDateVal;
        }
      } else {
        orderDateRaw = todayStr;
      }
    }
    const orderNumber = orderNoIdx >= 0 && row[orderNoIdx] ? String(row[orderNoIdx]).trim() : `ORD-${r}`;
    const productNumber = productNoIdx >= 0 && row[productNoIdx] ? String(row[productNoIdx]).trim() : '';
    const optionName = optionIdx >= 0 && row[optionIdx] ? String(row[optionIdx]).trim() : '기본';
    const quantity = Math.max(1, Number(qtyIdx >= 0 ? row[qtyIdx] : 1) || 1);
    const recipient = recipientIdx >= 0 && row[recipientIdx] ? String(row[recipientIdx]).trim() : '고객';

    // Pricing
    let rawPrice = priceIdx >= 0 && row[priceIdx] !== undefined ? Number(String(row[priceIdx]).replace(/[^0-9.-]/g, '')) : 0;
    let rawUnitPrice = unitPriceIdx >= 0 && row[unitPriceIdx] !== undefined ? Number(String(row[unitPriceIdx]).replace(/[^0-9.-]/g, '')) : 0;

    if (rawPrice === 0 && rawUnitPrice > 0) {
      rawPrice = rawUnitPrice * quantity;
    } else if (rawPrice > 0 && rawUnitPrice === 0) {
      rawUnitPrice = Math.round(rawPrice / quantity);
    }

    // Shipping fee
    let buyerShipping = 0;
    if (shippingIdx >= 0 && row[shippingIdx] !== undefined) {
      const shipStr = String(row[shippingIdx]).trim();
      if (shipStr.includes('무료') || shipStr === '0') {
        buyerShipping = 0;
      } else {
        buyerShipping = Number(shipStr.replace(/[^0-9.-]/g, '')) || 0;
      }
    }

    // Fees & Settlement if available in raw sheet
    const rawFee = feeIdx >= 0 && row[feeIdx] !== undefined ? Number(String(row[feeIdx]).replace(/[^0-9.-]/g, '')) : undefined;
    const rawKFee = kFeeIdx >= 0 && row[kFeeIdx] !== undefined ? Number(String(row[kFeeIdx]).replace(/[^0-9.-]/g, '')) : undefined;
    const rawSettlement = settlementIdx >= 0 && row[settlementIdx] !== undefined ? Number(String(row[settlementIdx]).replace(/[^0-9.-]/g, '')) : undefined;
    const rawCost = costIdx >= 0 && row[costIdx] !== undefined ? Number(String(row[costIdx]).replace(/[^0-9.-]/g, '')) : undefined;

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

  if (rawRows.length === 0) throw new Error('파일에 데이터가 없습니다.');

  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rawRows.length); i++) {
    const rowStr = rawRows[i].join(' ');
    if (rowStr.includes('상품명') || rowStr.includes('원가')) {
      headerIdx = i;
      break;
    }
  }

  const headers = rawRows[headerIdx].map((h) => String(h || '').trim());
  const pIdx = headers.findIndex((h) => h.includes('상품명'));
  const oIdx = headers.findIndex((h) => h.includes('옵션'));
  const cIdx = headers.findIndex((h) => h.includes('원가') || h.includes('단가') || h.includes('매입'));
  const catIdx = headers.findIndex((h) => h.includes('카테고리') || h.includes('분류'));
  const sIdx = headers.findIndex((h) => h.includes('공급처') || h.includes('거래처'));
  const mIdx = headers.findIndex((h) => h.includes('메모') || h.includes('비고'));

  const items: CostItem[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (let r = headerIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const productName = pIdx >= 0 && row[pIdx] ? String(row[pIdx]).trim() : '';
    if (!productName) continue;

    const optionName = oIdx >= 0 && row[oIdx] ? String(row[oIdx]).trim() : '기본';
    const cost = Number(cIdx >= 0 ? String(row[cIdx]).replace(/[^0-9.-]/g, '') : 0) || 0;
    const category = catIdx >= 0 && row[catIdx] ? String(row[catIdx]).trim() : '';
    const supplier = sIdx >= 0 && row[sIdx] ? String(row[sIdx]).trim() : '';
    const memo = mIdx >= 0 && row[mIdx] ? String(row[mIdx]).trim() : '';

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
