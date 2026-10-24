const { todayLocal } = require('../utils/dates');
const { getCashbackCycle } = require('../utils/helpers');

const d = (s) => new Date(`${s}T00:00:00.000Z`);
const ymd = (c) => ({ start: c.start.toISOString().slice(0, 10), end: c.end.toISOString().slice(0, 10) });

describe('business-timezone today', () => {
  it('rolls over at local (IST) midnight, not UTC midnight', () => {
    expect(todayLocal(new Date('2026-10-24T18:29:00Z'))).toBe('2026-10-24'); // 23:59 IST
    expect(todayLocal(new Date('2026-10-24T18:31:00Z'))).toBe('2026-10-25'); // 00:01 IST
  });
});

describe('getCashbackCycle', () => {
  it('monthly with a reset day', () => {
    expect(ymd(getCashbackCycle(15, 'monthly', 1, d('2026-10-10')))).toEqual({ start: '2026-09-15', end: '2026-10-15' });
    expect(ymd(getCashbackCycle(15, 'monthly', 1, d('2026-10-15')))).toEqual({ start: '2026-10-15', end: '2026-11-15' });
  });
  it('clamps day 31 in short months', () => {
    expect(ymd(getCashbackCycle(31, 'monthly', 1, d('2026-03-05')))).toEqual({ start: '2026-02-28', end: '2026-03-31' });
  });
  it('quarterly / yearly anchored to the start month', () => {
    expect(ymd(getCashbackCycle(16, 'quarterly', 3, d('2026-06-15')))).toEqual({ start: '2026-03-16', end: '2026-06-16' });
    expect(ymd(getCashbackCycle(1, 'yearly', 4, d('2027-01-05')))).toEqual({ start: '2026-04-01', end: '2027-04-01' });
  });
});
