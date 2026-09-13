import { describe, it, expect } from 'vitest'
import { calcOffer, lineTotal, round2, type OfferCalcInput } from '@server/services/offerCalc'

const base: Omit<OfferCalcInput, 'vatMode'> = {
  lines: [
    { purchaseQty: 10, unitPrice: 100 }, // 1,000
    { purchaseQty: 5, unitPrice: 50 }, //   250
  ],
  vatPercent: 7,
  discountPercent: 0,
  discountAmount: 0,
  surchargePercent: 0,
  surchargeAmount: 0,
}

describe('round2 / lineTotal', () => {
  it('MUST round half up to 2 decimals', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
  })

  it('MUST compute a line total as qty x price', () => {
    expect(lineTotal({ purchaseQty: 3, unitPrice: 12.5 })).toBe(37.5)
  })
})

describe('calcOffer VAT modes', () => {
  it('MUST add VAT on top when mode is exclude', () => {
    const r = calcOffer({ ...base, vatMode: 'exclude' })
    expect(r.subtotal).toBe(1250)
    expect(r.amountBeforeVat).toBe(1250)
    expect(r.vatAmount).toBe(87.5)
    expect(r.netAmount).toBe(1337.5)
  })

  it('MUST back out VAT from the total when mode is include', () => {
    const r = calcOffer({ ...base, vatMode: 'include' })
    expect(r.netAmount).toBe(1250)
    expect(r.amountBeforeVat).toBe(1168.22)
    expect(r.vatAmount).toBe(81.78)
    // amountBeforeVat + vat MUST reconstruct the net
    expect(round2(r.amountBeforeVat + r.vatAmount)).toBe(1250)
  })

  it('MUST charge no VAT when mode is none', () => {
    const r = calcOffer({ ...base, vatMode: 'none' })
    expect(r.vatAmount).toBe(0)
    expect(r.netAmount).toBe(1250)
  })
})

describe('calcOffer discount and surcharge', () => {
  it('MUST apply a percentage discount before VAT', () => {
    const r = calcOffer({ ...base, vatMode: 'exclude', discountPercent: 10 })
    expect(r.discountValue).toBe(125)
    expect(r.afterAdjustment).toBe(1125)
    expect(r.vatAmount).toBe(78.75)
    expect(r.netAmount).toBe(1203.75)
  })

  it('MUST combine a percentage and a fixed discount amount', () => {
    const r = calcOffer({ ...base, vatMode: 'none', discountPercent: 10, discountAmount: 50 })
    expect(r.discountValue).toBe(175) // 125 + 50
    expect(r.netAmount).toBe(1075)
  })

  it('MUST add a surcharge after the discount', () => {
    const r = calcOffer({
      ...base,
      vatMode: 'none',
      discountAmount: 100,
      surchargePercent: 0,
      surchargeAmount: 30,
    })
    expect(r.afterAdjustment).toBe(1180) // 1250 - 100 + 30
    expect(r.netAmount).toBe(1180)
  })
})

describe('calcOffer edge cases', () => {
  it('MUST return zeros for an empty offer', () => {
    const r = calcOffer({ ...base, lines: [], vatMode: 'exclude' })
    expect(r.subtotal).toBe(0)
    expect(r.netAmount).toBe(0)
    expect(r.itemCount).toBe(0)
  })

  it('MUST count the number of lines', () => {
    expect(calcOffer({ ...base, vatMode: 'none' }).itemCount).toBe(2)
  })
})
