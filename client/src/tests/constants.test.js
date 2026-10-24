import { BANK_NAMES, CARD_NETWORKS, CASHBACK_PERIODS, MONTHS, ECOMM_SITES, DELIVERY_STATUS_OPTIONS } from '../constants';

describe('Constants', () => {
  it('BANK_NAMES is a sorted non-empty array of strings', () => {
    expect(BANK_NAMES.length).toBeGreaterThan(0);
    const sorted = [...BANK_NAMES].sort((a, b) => a.localeCompare(b));
    expect(BANK_NAMES).toEqual(sorted);
  });

  it('CARD_NETWORKS contains expected networks', () => {
    expect(CARD_NETWORKS).toContain('Visa');
    expect(CARD_NETWORKS).toContain('Mastercard');
    expect(CARD_NETWORKS).toContain('RuPay');
  });

  it('CASHBACK_PERIODS has value/label pairs', () => {
    expect(CASHBACK_PERIODS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'monthly', label: 'Monthly' }),
        expect.objectContaining({ value: 'quarterly', label: 'Quarterly' }),
      ])
    );
  });

  it('MONTHS has 12 entries from January to December', () => {
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS[0]).toEqual({ value: 1, label: 'January' });
    expect(MONTHS[11]).toEqual({ value: 12, label: 'December' });
  });

  it('ECOMM_SITES is a non-empty array', () => {
    expect(ECOMM_SITES.length).toBeGreaterThan(0);
    expect(ECOMM_SITES).toContain('Amazon');
  });

  it('DELIVERY_STATUS_OPTIONS has expected statuses', () => {
    const values = DELIVERY_STATUS_OPTIONS.map(d => d.value);
    expect(values).toContain('Delivered');
    expect(values).toContain('Pending');
    expect(values).toContain('Cancelled');
  });
});
