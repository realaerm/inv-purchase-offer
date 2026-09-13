// =============================================================================
// การคำนวณยอดเงินของใบเสนอซื้อ (pure function ทดสอบได้อิสระ)
//
// รองรับ VAT 3 แบบ:
//   - 'exclude' : ราคายังไม่รวม VAT  -> VAT บวกเพิ่มบนยอดหลังส่วนลด
//   - 'include' : ราคารวม VAT แล้ว   -> ถอด VAT ออกจากยอดหลังส่วนลด
//   - 'none'    : ไม่มี VAT
//
// ส่วนลด/ส่วนเพิ่มต่อใบ คิดจากทั้ง % และจำนวนเงิน:
//     discountValue = round(subtotal * discountPercent/100, 2) + discountAmount
//     surchargeValue = round(subtotal * surchargePercent/100, 2) + surchargeAmount
// (ใช้ % หรือจำนวนเงิน อย่างใดอย่างหนึ่งหรือทั้งคู่ก็ได้)
//
// ปัดทศนิยม 2 ตำแหน่งแบบ round-half-up ทุกยอดเงิน
// =============================================================================

export type VatMode = 'exclude' | 'include' | 'none'

export interface OfferCalcLine {
  purchaseQty: number
  unitPrice: number
}

export interface OfferCalcInput {
  lines: OfferCalcLine[]
  vatMode: VatMode
  vatPercent: number
  discountPercent: number
  discountAmount: number
  surchargePercent: number
  surchargeAmount: number
}

export interface OfferCalcResult {
  /** ยอดรวมรายการก่อนส่วนลด/ส่วนเพิ่ม (Σ qty × price) */
  subtotal: number
  discountValue: number
  surchargeValue: number
  /** ยอดหลังส่วนลด/ส่วนเพิ่ม (ฐานสำหรับ VAT) */
  afterAdjustment: number
  /** ยอดรวมก่อน VAT (สุทธิของฐานภาษี ไม่รวม VAT) */
  amountBeforeVat: number
  vatAmount: number
  netAmount: number
  itemCount: number
}

/** ปัดทศนิยม 2 ตำแหน่ง (round-half-up, กันปัญหา floating point) */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** ราคารวมรายบรรทัด = จำนวนซื้อ × ราคาต่อหน่วย (ปัด 2 ตำแหน่ง) */
export function lineTotal(line: OfferCalcLine): number {
  return round2(line.purchaseQty * line.unitPrice)
}

/** คำนวณยอดทั้งใบ */
export function calcOffer(input: OfferCalcInput): OfferCalcResult {
  const subtotal = round2(
    input.lines.reduce((sum, line) => sum + line.purchaseQty * line.unitPrice, 0),
  )

  const discountValue = round2(
    (subtotal * input.discountPercent) / 100 + input.discountAmount,
  )
  const surchargeValue = round2(
    (subtotal * input.surchargePercent) / 100 + input.surchargeAmount,
  )

  const afterAdjustment = round2(subtotal - discountValue + surchargeValue)

  let amountBeforeVat: number
  let vatAmount: number
  let netAmount: number

  const rate = input.vatPercent / 100

  switch (input.vatMode) {
    case 'none':
      amountBeforeVat = afterAdjustment
      vatAmount = 0
      netAmount = afterAdjustment
      break
    case 'include':
      // ราคารวม VAT แล้ว: ถอด VAT ออกเพื่อหายอดก่อน VAT
      amountBeforeVat = round2(afterAdjustment / (1 + rate))
      vatAmount = round2(afterAdjustment - amountBeforeVat)
      netAmount = afterAdjustment
      break
    case 'exclude':
    default:
      amountBeforeVat = afterAdjustment
      vatAmount = round2(afterAdjustment * rate)
      netAmount = round2(afterAdjustment + vatAmount)
      break
  }

  return {
    subtotal,
    discountValue,
    surchargeValue,
    afterAdjustment,
    amountBeforeVat,
    vatAmount,
    netAmount,
    itemCount: input.lines.length,
  }
}
