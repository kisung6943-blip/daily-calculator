import { CostItem, OrderItem, PlatformType, SettlementSettings } from '../types';

/**
 * Clean & normalize string for fuzzy matching
 */
export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\[\]\(\)\{\}\-_,]/g, '')
    .trim();
}

/**
 * Find matching cost item based on product name and option name
 */
export function findMatchingCost(
  productName: string,
  optionName: string,
  costItems: CostItem[]
): { cost: number; isMatched: boolean; matchedItem?: CostItem } {
  if (!productName || !costItems || costItems.length === 0) return { cost: 0, isMatched: false };

  // Strip leading product numbers (e.g. 12345678_ 또는 [12345])
  const cleanProductStr = productName.replace(/^\d+[_\s]+/, '').replace(/^\[\d+\][_\s]*/, '');
  const normProduct = normalizeText(cleanProductStr);
  const normOption = normalizeText(optionName);

  // Helper to check if an option name is considered a default/universal option
  const isDefaultOption = (opt: string) => {
    const o = normalizeText(opt);
    return !o || o === '기본' || o === '선택없음' || o === '단품' || o === '일반' || o === 'default';
  };

  // 1. Exact match (Product + Option)
  let found = costItems.find((item) => {
    const itemP = normalizeText(item.productName);
    const itemO = normalizeText(item.optionName);
    return itemP === normProduct && (itemO === normOption || isDefaultOption(item.optionName) || isDefaultOption(optionName));
  });

  if (found) {
    return { cost: found.cost, isMatched: true, matchedItem: found };
  }

  // 2. Product Substring matching (contains product name)
  found = costItems.find((item) => {
    const itemP = normalizeText(item.productName);
    if (!itemP) return false;
    const pMatch = normProduct.includes(itemP) || itemP.includes(normProduct);
    const itemO = normalizeText(item.optionName);
    const oMatch = isDefaultOption(item.optionName) || isDefaultOption(optionName) || normOption.includes(itemO) || itemO.includes(normOption);
    return pMatch && oMatch;
  });

  if (found) {
    return { cost: found.cost, isMatched: true, matchedItem: found };
  }

  // 3. Fallback: Match by Product Name alone if cost item option is default
  found = costItems.find((item) => {
    const itemP = normalizeText(item.productName);
    if (!itemP) return false;
    return (normProduct.includes(itemP) || itemP.includes(normProduct)) && item.cost > 0;
  });

  if (found) {
    return { cost: found.cost, isMatched: true, matchedItem: found };
  }

  return { cost: 0, isMatched: false };
}

/**
 * Determine default platform fee rate based on platform & product category
 */
export function getPlatformFeeRate(
  platform: PlatformType,
  productName: string,
  settings: SettlementSettings
): number {
  if (platform === 'coupang') {
    // 쌀, 백미, 찹쌀, 현미, 햅쌀 등 양곡류는 6%
    const isRice = /쌀|햅쌀|고시히카리|경기미|추청|현미|백미|찹쌀|오대쌀|일품쌀|잡곡/.test(productName);
    return isRice ? settings.coupangRiceFee : settings.coupangDefaultFee;
  }
  if (platform === 'homepage') {
    return settings.homepageFee;
  }
  if (platform === 'smartstore') {
    return settings.smartstoreBaseFee + settings.smartstoreKnowledgeFee;
  }
  if (platform === 'ohouse') {
    return settings.ohouseDefaultFee;
  }
  if (platform === 'elevenst') {
    return settings.elevenstDefaultFee;
  }
  if (platform === 'gmarket') {
    return settings.gmarketDefaultFee;
  }
  if (platform === 'auction') {
    return settings.auctionDefaultFee;
  }
  return 13.0;
}

/**
 * Recalculate full order financials given item & settings
 */
export function recalculateOrder(
  order: Partial<OrderItem>,
  settings: SettlementSettings,
  isBundleSubItem: boolean = false
): OrderItem {
  const platform = order.platform || 'smartstore';
  const quantity = Math.max(1, Number(order.quantity) || 1);
  const unitPrice = Number(order.unitPrice) || 0;
  const totalPrice = order.totalPrice !== undefined ? Number(order.totalPrice) : unitPrice * quantity;

  // Buyer shipping fee: if bundle sub-item, 0 unless specified
  const buyerShippingFee = isBundleSubItem ? 0 : Number(order.buyerShippingFee) || 0;
  const isShippingFree = buyerShippingFee === 0;

  // Platform fee calculation
  let feeRate = order.feeRate !== undefined ? Number(order.feeRate) : getPlatformFeeRate(platform, order.productName || '', settings);
  let feeAmount = Math.abs(Number(order.feeAmount) || 0);
  let knowledgeShoppingFee = Math.abs(Number(order.knowledgeShoppingFee) || 0);
  let settlementAmount = Math.abs(Number(order.settlementAmount) || 0);

  if (platform === 'ohouse') {
    // 오늘의집: 판매금액 - 정산금액 = 수수료 or calculated
    if (order.settlementAmount && order.settlementAmount > 0) {
      settlementAmount = Math.abs(Number(order.settlementAmount));
      feeAmount = Math.max(0, totalPrice - settlementAmount);
      feeRate = totalPrice > 0 ? (feeAmount / totalPrice) * 100 : feeRate;
    } else {
      feeAmount = Math.round(totalPrice * (feeRate / 100));
      settlementAmount = totalPrice - feeAmount;
    }
  } else if (platform === 'smartstore') {
    // 스마트스토어: 결제수수료 + 지식쇼핑수수료
    if (order.settlementAmount && order.settlementAmount > 0) {
      settlementAmount = Math.abs(Number(order.settlementAmount));
      if (order.feeAmount !== undefined) feeAmount = Math.abs(Number(order.feeAmount));
      if (order.knowledgeShoppingFee !== undefined) knowledgeShoppingFee = Math.abs(Number(order.knowledgeShoppingFee));
    } else if (order.feeAmount !== undefined && order.knowledgeShoppingFee !== undefined) {
      feeAmount = Math.abs(Number(order.feeAmount));
      knowledgeShoppingFee = Math.abs(Number(order.knowledgeShoppingFee));
      settlementAmount = totalPrice - (feeAmount + knowledgeShoppingFee);
    } else {
      const baseFee = Math.round(totalPrice * (settings.smartstoreBaseFee / 100));
      const kFee = Math.round(totalPrice * (settings.smartstoreKnowledgeFee / 100));
      feeAmount = baseFee;
      knowledgeShoppingFee = kFee;
      settlementAmount = totalPrice - (baseFee + kFee);
    }
  } else {
    // 쿠팡, 자사몰, 11번가, G마켓, 옥션
    if (order.settlementAmount && order.settlementAmount > 0) {
      settlementAmount = Math.abs(Number(order.settlementAmount));
      if (order.feeAmount !== undefined) feeAmount = Math.abs(Number(order.feeAmount));
    } else if (order.feeAmount !== undefined) {
      feeAmount = Math.abs(Number(order.feeAmount));
      settlementAmount = totalPrice - feeAmount;
    } else {
      feeAmount = Math.round(totalPrice * (feeRate / 100) * 10) / 10;
      settlementAmount = Math.round(totalPrice - feeAmount);
    }
  }

  // Cost
  const unitCost = Number(order.unitCost) || 0;
  const totalCost = unitCost * quantity;

  // Packaging & Actual Shipping
  let packagingCost = order.packagingCost !== undefined ? Number(order.packagingCost) : settings.defaultPackagingCost;
  if (isBundleSubItem && settings.bundleOnlyFirstPackageCost) {
    packagingCost = 0;
  }

  const actualShippingCost = isBundleSubItem
    ? 0
    : order.actualShippingCost !== undefined
    ? Number(order.actualShippingCost)
    : settings.defaultActualShippingCost;

  // Gross profit: 정산가 + 고객배송비 - 원가합계 - 포장비 - 실배송비
  const grossProfit = Math.round(settlementAmount + buyerShippingFee - totalCost - packagingCost - actualShippingCost);

  // VAT (부가세)
  let vatAmount = 0;
  let vatDeductedProfit = 0;

  if (settings.vatCalculationMethod === 'simple10') {
    // 10% 부가세 제외
    vatDeductedProfit = Math.round(grossProfit * 0.9);
    vatAmount = grossProfit - vatDeductedProfit;
  } else {
    // Standard: (매출/1.1 * 0.1) - (매입/1.1 * 0.1)
    const salesVat = Math.round((totalPrice + buyerShippingFee - feeAmount) / 11);
    const purchaseVat = Math.round((totalCost + packagingCost + actualShippingCost) / 11);
    vatAmount = Math.max(0, salesVat - purchaseVat);
    vatDeductedProfit = grossProfit - vatAmount;
  }

  // Income Tax (종합소득세 10% or user setting)
  const incomeTaxRate = settings.defaultIncomeTaxRate / 100;
  const incomeTax = Math.round(vatDeductedProfit * incomeTaxRate * 100) / 100;

  // Net Profit (최종 순수익)
  const netProfit = Math.round(vatDeductedProfit - incomeTax);

  // Margin Rate (%) = (순수익 / (총판매금액 + 고객배송비)) * 100
  const totalRevenue = totalPrice + buyerShippingFee;
  const marginRate = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

  return {
    id: order.id || `ord-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    platform,
    orderDate: order.orderDate || new Date().toISOString().split('T')[0],
    orderNumber: order.orderNumber || '',
    productNumber: order.productNumber || '',
    productName: order.productName || '',
    optionName: order.optionName || '',
    quantity,
    recipient: order.recipient || '',
    recipientPhone: order.recipientPhone || '',
    recipientAddress: order.recipientAddress || '',
    unitPrice,
    totalPrice,
    buyerShippingFee,
    isShippingFree,
    feeRate,
    feeAmount,
    knowledgeShoppingFee,
    settlementAmount,
    unitCost,
    totalCost,
    packagingCost,
    actualShippingCost,
    isBundleShipping: isBundleSubItem || Boolean(order.isBundleShipping),
    bundleGroupId: order.bundleGroupId,
    grossProfit,
    vatDeductedProfit,
    vatAmount,
    incomeTax,
    netProfit,
    marginRate,
    isCostMatched: order.isCostMatched !== undefined ? order.isCostMatched : unitCost > 0,
    memo: order.memo,
  };
}

/**
 * Process an entire list of orders:
 * 1. Automatically detect bundle shipments (same date + same recipient)
 * 2. Auto-match unit costs from cost master
 * 3. Calculate all financial metrics
 */
export function processAllOrders(
  orders: OrderItem[],
  costItems: CostItem[],
  settings: SettlementSettings
): OrderItem[] {
  // First pass: match costs if not manually overridden
  const matchedOrders = orders.map((ord) => {
    let unitCost = ord.unitCost;
    let isMatched = ord.isCostMatched;

    if (!unitCost || unitCost === 0 || !isMatched) {
      const matchResult = findMatchingCost(ord.productName, ord.optionName, costItems);
      if (matchResult.isMatched) {
        unitCost = matchResult.cost;
        isMatched = true;
      }
    }

    return {
      ...ord,
      unitCost,
      isCostMatched: isMatched,
    };
  });

  if (!settings.autoBundleShipping) {
    return matchedOrders.map((ord) => recalculateOrder(ord, settings, false));
  }

  // Group by (orderDate + recipient + platform) to find multi-orders
  const groups: Record<string, OrderItem[]> = {};

  matchedOrders.forEach((ord) => {
    const key = `${ord.orderDate || 'nodate'}__${ord.platform || 'noplatform'}__${(ord.recipient || '').trim()}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(ord);
  });

  const result: OrderItem[] = [];

  Object.entries(groups).forEach(([key, groupItems]) => {
    const isMulti = groupItems.length > 1 && Boolean(groupItems[0].recipient.trim());
    const bundleGroupId = isMulti ? `BUNDLE-${key.replace(/[^a-zA-Z0-9가-힣]/g, '')}` : undefined;

    groupItems.forEach((item, index) => {
      const isSubItem = isMulti && index > 0;
      const updated = recalculateOrder(
        {
          ...item,
          isBundleShipping: isMulti,
          bundleGroupId,
        },
        settings,
        isSubItem
      );
      result.push(updated);
    });
  });

  return result;
}

/**
 * Format currency in Korean Won (e.g. 1,500원 or 1,500)
 */
export function formatKRW(val: number, withWon: boolean = false): string {
  const formatted = new Intl.NumberFormat('ko-KR').format(Math.round(val || 0));
  return withWon ? `${formatted}원` : formatted;
}
