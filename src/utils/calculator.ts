import { CostItem, OrderItem, PlatformType, SettlementSettings } from '../types';

const normCache = new Map<string, string>();

/**
 * Clean & normalize string for fuzzy matching (memoized for speed)
 */
export function normalizeText(str: string): string {
  if (!str) return '';
  const cached = normCache.get(str);
  if (cached !== undefined) return cached;

  const normalized = str
    .toLowerCase()
    .replace(/^[0-9]+[.\s]*/, '') // Remove leading digits like "3.", "64." from Ohouse product names
    .replace(/\s+/g, ' ')
    .replace(/[\[\]\(\)\{\}\-_,]/g, '')
    .trim();

  if (normCache.size > 5000) normCache.clear();
  normCache.set(str, normalized);
  return normalized;
}

/**
 * Helper to check if two option names are effectively identical
 */
export function isSameOption(opt1: string = '', opt2: string = ''): boolean {
  const norm1 = normalizeText(opt1);
  const norm2 = normalizeText(opt2);
  const isDefault1 = !norm1 || norm1 === '기본' || norm1 === '단품' || norm1 === '없음' || norm1 === '-';
  const isDefault2 = !norm2 || norm2 === '기본' || norm2 === '단품' || norm2 === '없음' || norm2 === '-';

  if (isDefault1 && isDefault2) return true;
  return norm1 === norm2;
}

/**
 * Find matching cost item based strictly on matching product name and option name
 */
export function findMatchingCost(
  productName: string,
  optionName: string,
  costItems: CostItem[]
): { cost: number; isMatched: boolean; matchedItem?: CostItem } {
  if (!productName || !costItems || costItems.length === 0) return { cost: 0, isMatched: false };

  const normProduct = normalizeText(productName);
  const rawNormProduct = productName.toLowerCase().replace(/[^a-zA-Z0-9가-힣]/g, '');

  // Strict match ONLY: BOTH product name AND option name must match!
  const found = costItems.find((item) => {
    const itemP = normalizeText(item.productName);
    const itemRawP = item.productName.toLowerCase().replace(/[^a-zA-Z0-9가-힣]/g, '');
    const isProdMatch = (itemP === normProduct || itemRawP === rawNormProduct);
    if (!isProdMatch) return false;

    return isSameOption(item.optionName, optionName);
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
    // 누룽지는 쌀(6%)이 아니라 부가세별도 10.6% -> 부가세 포함 11.66% 적용
    const isNurungji = /누룽지/.test(productName);
    if (isNurungji) {
      return settings.coupangNurungjiFee || 11.66;
    }
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

  let totalPrice = 0;
  let unitPrice = 0;

  if (order.unitPrice !== undefined && Number(order.unitPrice) > 0) {
    unitPrice = Number(order.unitPrice);
    if (order.totalPrice !== undefined && Number(order.totalPrice) > 0 && Math.abs(unitPrice * quantity - Number(order.totalPrice)) < 2) {
      totalPrice = Number(order.totalPrice);
    } else {
      totalPrice = unitPrice * quantity;
    }
  } else if (order.totalPrice !== undefined && Number(order.totalPrice) > 0) {
    totalPrice = Number(order.totalPrice);
    unitPrice = Math.round(totalPrice / quantity);
  }

  // Buyer shipping fee: if bundle sub-item, 0 unless specified
  const buyerShippingFee = isBundleSubItem ? 0 : Number(order.buyerShippingFee) || 0;
  const isShippingFree = buyerShippingFee === 0;

  // Platform fee calculation: if Coupang order has '누룽지' and previous 6% was mistakenly set, auto-correct to 11.66%
  const isNurungji = /누룽지/.test(order.productName || '');
  const isCoupangNurungjiWithOldFee = platform === 'coupang' && isNurungji && order.feeRate === 6;
  let feeRate = (order.feeRate !== undefined && !isCoupangNurungjiWithOldFee) 
    ? Number(order.feeRate) 
    : getPlatformFeeRate(platform, order.productName || '', settings);

  let feeAmount = Number(order.feeAmount) || 0;
  let knowledgeShoppingFee = Number(order.knowledgeShoppingFee) || 0;
  let settlementAmount = Number(order.settlementAmount) || 0;

  if (platform === 'smartstore') {
    // 스마트스토어: 결제수수료 + 지식쇼핑수수료 (정산금액 = 총판매가 - 수수료합)
    feeAmount = order.feeAmount !== undefined ? Math.abs(Number(order.feeAmount)) : Math.round(totalPrice * (settings.smartstoreBaseFee / 100));
    knowledgeShoppingFee = order.knowledgeShoppingFee !== undefined ? Math.abs(Number(order.knowledgeShoppingFee)) : Math.round(totalPrice * (settings.smartstoreKnowledgeFee / 100));
    settlementAmount = totalPrice - (feeAmount + knowledgeShoppingFee);
  } else {
    // 쿠팡, 오늘의집, 자사몰(홈페이지), 11번가, G마켓, 옥션: (정산금액 = 총판매가 - 수수료)
    if (order.settlementAmount !== undefined && Number(order.settlementAmount) > 0 && Math.abs(totalPrice - Number(order.settlementAmount)) <= totalPrice && !isCoupangNurungjiWithOldFee) {
      // Prioritize explicit settlement amount from Excel
      settlementAmount = Number(order.settlementAmount);
      feeAmount = Math.max(0, totalPrice - settlementAmount);
    } else if (order.feeAmount !== undefined && Number(order.feeAmount) > 0 && !isCoupangNurungjiWithOldFee) {
      feeAmount = Math.abs(Number(order.feeAmount));
      settlementAmount = totalPrice - feeAmount;
    } else {
      feeAmount = Math.round(totalPrice * (feeRate / 100));
      settlementAmount = totalPrice - feeAmount;
    }
  }

  // Cost
  const unitCost = Number(order.unitCost) || 0;
  const totalCost = unitCost * quantity;

  // Packaging & Actual Shipping (누룽지는 일반 포장비 500원 적용)
  const isRiceProduct = !isNurungji && /쌀|햅쌀|고시히카리|경기미|추청|현미|백미|찹쌀|오대쌀|일품쌀|잡곡/.test(order.productName || '');
  const defaultPkgCost = isRiceProduct ? (settings.ricePackagingCost || 1000) : settings.defaultPackagingCost;
  let packagingCost = order.packagingCost !== undefined ? Number(order.packagingCost) : defaultPkgCost;
  if (isBundleSubItem && (settings.bundleOnlyFirstPackageCost ?? true)) {
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
    rawBuyerShippingFee: order.rawBuyerShippingFee !== undefined ? Number(order.rawBuyerShippingFee) : buyerShippingFee,
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
 * Deduplicate exact identical order items (same platform, date, order number, product, option, recipient, qty, price)
 */
export function deduplicateOrders(orders: OrderItem[]): OrderItem[] {
  const seen = new Set<string>();
  return orders.filter((o) => {
    const signature = `${o.platform || ''}__${o.orderDate || ''}__${o.orderNumber || ''}__${(o.productName || '').trim()}__${(o.optionName || '').trim()}__${(o.recipient || '').trim()}__${o.quantity}__${o.totalPrice}`;
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
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
  // Build Map for O(1) cost lookups
  const costMap = new Map<string, number>();
  (costItems || []).forEach((c) => {
    const normP = normalizeText(c.productName);
    const rawNormP = c.productName ? c.productName.toLowerCase().replace(/[^a-zA-Z0-9가-힣]/g, '') : '';
    const normOpt = normalizeText(c.optionName);
    const optKey = (!normOpt || normOpt === '기본' || normOpt === '단품' || normOpt === '없음' || normOpt === '-') ? 'default' : normOpt;

    if (normP) costMap.set(`${normP}__${optKey}`, c.cost);
    if (rawNormP) costMap.set(`${rawNormP}__${optKey}`, c.cost);
  });

  // First pass: match costs if not manually overridden
  const matchedOrders = orders.map((ord) => {
    let unitCost = ord.unitCost;
    let isMatched = ord.isCostMatched;

    if (!unitCost || unitCost === 0 || !isMatched) {
      if (ord.productName) {
        const normOrdP = normalizeText(ord.productName);
        const rawNormOrdP = ord.productName.toLowerCase().replace(/[^a-zA-Z0-9가-힣]/g, '');
        const normOrdOpt = normalizeText(ord.optionName);
        const optKey = (!normOrdOpt || normOrdOpt === '기본' || normOrdOpt === '단품' || normOrdOpt === '없음' || normOrdOpt === '-') ? 'default' : normOrdOpt;

        const matchedCost =
          costMap.get(`${normOrdP}__${optKey}`) ??
          costMap.get(`${normOrdP}__default`) ??
          (rawNormOrdP
            ? costMap.get(`${rawNormOrdP}__${optKey}`) ?? costMap.get(`${rawNormOrdP}__default`)
            : undefined);
        if (matchedCost !== undefined && matchedCost > 0) {
          unitCost = matchedCost;
          isMatched = true;
        }
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

    // Single customer shipping fee paid for the bundle group (customers pay shipping fee ONCE per bundle order)
    let singleGroupBuyerShipping = 0;
    if (isMulti) {
      const fees = groupItems
        .map((item) => {
          const val = Number(item.rawBuyerShippingFee ?? item.buyerShippingFee) || 0;
          return val;
        })
        .filter((f) => f > 0);

      if (fees.length > 0) {
        const maxFee = Math.max(...fees);
        // If maxFee was inflated by old sum (e.g. 6000 for 2 items -> 3000, 5000 for 2 items -> 2500, 10000 for 4 items -> 2500)
        if (maxFee >= 5000 && groupItems.length > 1) {
          const feePerItem = Math.round(maxFee / groupItems.length);
          singleGroupBuyerShipping = feePerItem >= 2000 ? feePerItem : 2500;
        } else {
          singleGroupBuyerShipping = Math.min(...fees);
        }
      }
    }

    // Pick representative item: the item with HIGHEST sale price (totalPrice or settlementAmount)
    let repIndex = 0;
    if (isMulti) {
      let maxSales = -1;
      let maxFee = -1;
      groupItems.forEach((item, idx) => {
        const sales = Number(item.totalPrice) || Number(item.settlementAmount) || 0;
        const fee = Number(item.rawBuyerShippingFee ?? item.buyerShippingFee) || 0;
        if (sales > maxSales || (sales === maxSales && fee > maxFee)) {
          maxSales = sales;
          maxFee = fee;
          repIndex = idx;
        }
      });
    }

    groupItems.forEach((item, index) => {
      const isSubItem = isMulti && index !== repIndex;
      const updated = recalculateOrder(
        {
          ...item,
          rawBuyerShippingFee: item.rawBuyerShippingFee ?? (isSubItem ? singleGroupBuyerShipping : item.buyerShippingFee),
          buyerShippingFee: isSubItem ? 0 : (isMulti ? singleGroupBuyerShipping : item.buyerShippingFee),
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

const ENG_KEY: Record<string, string> = {
  r: 'ㄱ', R: 'ㄲ', s: 'ㄴ', e: 'ㄷ', E: 'ㄸ', f: 'ㄹ', a: 'ㅁ', q: 'ㅂ', Q: 'ㅃ',
  t: 'ㅅ', T: 'ㅆ', d: 'ㅇ', w: 'ㅈ', W: 'ㅉ', c: 'ㅊ', z: 'ㅋ', x: 'ㅌ', v: 'ㅍ', g: 'ㅎ',
  k: 'ㅏ', o: 'ㅐ', i: 'ㅑ', O: 'ㅒ', j: 'ㅓ', p: 'ㅔ', u: 'ㅕ', P: 'ㅖ', h: 'ㅗ',
  y: 'ㅛ', n: 'ㅜ', b: 'ㅠ', m: 'ㅡ', l: 'ㅣ'
};

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JOUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const D_JOUNG: Record<string, string> = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
const D_JONG: Record<string, string> = { 'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄴㅈ', 'ㄴㅎ': 'ㄴㅎ', 'ㄹㄱ': 'ㄹㄱ', 'ㄹㅁ': 'ㄹㅁ', 'ㄹㅂ': 'ㄹㅂ', 'ㄹㅅ': 'ㄹㅅ', 'ㄹㅌ': 'ㄹㅌ', 'ㄹㅍ': 'ㄹㅍ', 'ㄹㅎ': 'ㄹㅎ', 'ㅂㅅ': 'ㅄ' };

/**
 * Convert English QWERTY key strokes to Korean Hangul (영타 -> 한글 자동 변환)
 */
export function engToKor(input: string): string {
  if (!input) return input;
  // Remove trailing punctuation (like ';' or ',') often hit accidentally while typing in QWERTY mode
  const cleanInput = input.replace(/[;,._\-]+$/g, '');
  const target = /[a-zA-Z]/.test(cleanInput) ? cleanInput : input;
  if (!/[a-zA-Z]/.test(target)) return input;

  let result = '';
  const len = target.length;
  let i = 0;

  while (i < len) {
    const char = target[i];
    if (!ENG_KEY[char]) {
      result += char;
      i++;
      continue;
    }

    const choIdx = CHO.indexOf(ENG_KEY[char]);
    if (choIdx < 0) {
      result += ENG_KEY[char];
      i++;
      continue;
    }

    if (i + 1 < len && ENG_KEY[input[i + 1]] && JOUNG.indexOf(ENG_KEY[input[i + 1]]) >= 0) {
      let joungStr = ENG_KEY[input[i + 1]];
      let nextIdx = i + 2;

      if (nextIdx < len && ENG_KEY[input[nextIdx]]) {
        const combinedJoung = D_JOUNG[joungStr + ENG_KEY[input[nextIdx]]];
        if (combinedJoung) {
          joungStr = combinedJoung;
          nextIdx++;
        }
      }

      const joungIdx = JOUNG.indexOf(joungStr);
      let jongIdx = 0;

      if (nextIdx < len && ENG_KEY[input[nextIdx]]) {
        const candidate1 = ENG_KEY[input[nextIdx]];
        const candidate1JongIdx = JONG.indexOf(candidate1);
        const isFollowedByVowel = nextIdx + 1 < len && ENG_KEY[input[nextIdx + 1]] && JOUNG.indexOf(ENG_KEY[input[nextIdx + 1]]) >= 0;

        if (candidate1JongIdx > 0 && !isFollowedByVowel) {
          if (nextIdx + 1 < len && ENG_KEY[input[nextIdx + 1]]) {
            const candidate2 = ENG_KEY[input[nextIdx + 1]];
            const doubleJong = D_JONG[candidate1 + candidate2];
            const isDoubleFollowedByVowel = nextIdx + 2 < len && ENG_KEY[input[nextIdx + 2]] && JOUNG.indexOf(ENG_KEY[input[nextIdx + 2]]) >= 0;

            if (doubleJong && JONG.indexOf(doubleJong) > 0 && !isDoubleFollowedByVowel) {
              jongIdx = JONG.indexOf(doubleJong);
              nextIdx += 2;
            } else {
              jongIdx = candidate1JongIdx;
              nextIdx++;
            }
          } else {
            jongIdx = candidate1JongIdx;
            nextIdx++;
          }
        }
      }

      const syllableCode = 0xac00 + (choIdx * 21 + joungIdx) * 28 + jongIdx;
      result += String.fromCharCode(syllableCode);
      i = nextIdx;
    } else {
      result += ENG_KEY[char];
      i++;
    }
  }

  return result;
}

/**
 * Format currency in Korean Won (e.g. 1,500원 or 1,500)
 */
export function formatKRW(val: number, withWon: boolean = false): string {
  const formatted = new Intl.NumberFormat('ko-KR').format(Math.round(val || 0));
  return withWon ? `${formatted}원` : formatted;
}

