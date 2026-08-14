export type PlatformType =
  | 'smartstore'
  | 'coupang'
  | 'ohouse'
  | 'homepage'
  | 'elevenst'
  | 'gmarket'
  | 'auction';

export interface PlatformConfig {
  id: PlatformType;
  name: string;
  shortName: string;
  badgeColor: string;
  borderColor: string;
  textColor: string;
  bgColor: string;
  defaultFeeRate: number; // percentage (e.g. 13 for 13%)
  description: string;
}

export interface CostItem {
  id: string;
  productName: string;
  optionName: string;
  cost: number;
  category?: string;
  supplier?: string;
  memo?: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  platform: PlatformType;
  orderDate: string; // YYYY-MM-DD or MM월 DD일
  orderNumber: string;
  productNumber?: string;
  productName: string;
  optionName: string;
  quantity: number;
  recipient: string;
  recipientPhone?: string;
  recipientAddress?: string;

  // Pricing & Revenue
  unitPrice: number; // 판매단가
  totalPrice: number; // 판매금액 (unitPrice * quantity or 엑셀상 판매금액)
  buyerShippingFee: number; // 고객지불 배송비
  isShippingFree?: boolean; // 무료배송 여부

  // Channel Fees & Settlement
  feeRate?: number; // 수수료율 (%)
  feeAmount: number; // 플랫폼 수수료
  knowledgeShoppingFee?: number; // 지식쇼핑 유입 수수료 (스마트스토어용)
  settlementAmount: number; // 정산가 (판매가 - 수수료 or 채널 정산금액)

  // Cost & Expenses
  unitCost: number; // 개당 원가 (원가표에서 자동 매칭)
  totalCost: number; // 원가합계 (unitCost * quantity)
  packagingCost: number; // 포장비 (기본 500원)
  actualShippingCost: number; // 실택배비 (기본 1,900원, 합배송시 0원)
  isBundleShipping?: boolean; // 합배송 여부 (동일고객 다건)
  bundleGroupId?: string; // 합배송 그룹 식별자

  // Profit & Taxes
  grossProfit: number; // 순익 = 정산가 + 고객배송비 - 원가합계 - 포장비 - 실배송비
  vatDeductedProfit: number; // 부가세제외 순익 (순익 - (매출부가세 - 매입부가세))
  vatAmount: number; // 부가세 납부예상액
  incomeTax: number; // 종합소득세 (기본 10%)
  netProfit: number; // 최종 순수익 (부가세제외 순익 - 종합소득세)
  marginRate: number; // 마진율 (%) = (순수익 / 총판매금액) * 100

  // Metadata
  isCostMatched: boolean; // 원가 매칭 여부
  memo?: string;
}

export interface SettlementSettings {
  defaultPackagingCost: number; // 기본 포장비 (500원)
  defaultActualShippingCost: number; // 기본 실택배비 (1,900원)
  defaultIncomeTaxRate: number; // 종합소득세율 (10%)
  vatCalculationMethod: 'standard' | 'simple10'; // 부가세 산출 방식: 표준(매출-매입부가세) vs 10% 일괄
  autoBundleShipping: boolean; // 동일 고객 합배송 자동 처리 여부
  bundleOnlyFirstPackageCost: boolean; // 합배송시 포장비도 1회만 부과할지 여부

  // Platform specific fee defaults
  coupangDefaultFee: number; // 13%
  coupangRiceFee: number; // 6% (쌀/양곡)
  homepageFee: number; // 3.85%
  smartstoreBaseFee: number; // 3.74%
  smartstoreKnowledgeFee: number; // 2.0%
  ohouseDefaultFee: number; // 15%
  elevenstDefaultFee: number; // 13%
  gmarketDefaultFee: number; // 13%
  auctionDefaultFee: number; // 13%
}

export interface DailySummary {
  date: string;
  orderCount: number;
  totalSales: number; // 총 매출액 (판매금액 + 고객배송비)
  productSales: number; // 순수 상품 판매금액
  shippingRevenue: number; // 고객 지불 배송비 총액
  feeTotal: number; // 총 수수료
  settlementTotal: number; // 총 정산예정액
  costTotal: number; // 총 매입원가
  packagingTotal: number; // 총 포장비
  actualShippingTotal: number; // 총 실택배비
  grossProfitTotal: number; // 총 순익
  vatTotal: number; // 총 부가세
  incomeTaxTotal: number; // 총 종합소득세
  netProfitTotal: number; // 총 순수익
  marginRate: number; // 평균 마진율 (%)
}

export interface PlatformSummary {
  platform: PlatformType;
  platformName: string;
  orderCount: number;
  totalSales: number;
  feeTotal: number;
  settlementTotal: number;
  costTotal: number;
  netProfitTotal: number;
  marginRate: number;
}
