import { describe, it, expect } from 'vitest';
import { orderProfit, friendEarning, isFriendOrder, pctLabel } from '../utils/profit';

describe('profit utils', () => {
  const base = { order_amount: 50000, return_amount: 51000, cashback: 2500 };

  it('own/family order: return − order + cashback', () => {
    expect(isFriendOrder({ ...base, friend_amount: null })).toBe(false);
    expect(orderProfit({ ...base, friend_amount: null })).toBe(3500);
    expect(friendEarning({ ...base, friend_amount: null })).toBe(0);
  });

  it('friend order: my profit = return − given; friend earns given − order + cashback', () => {
    const o = { ...base, friend_amount: 50300 };
    expect(isFriendOrder(o)).toBe(true);
    expect(orderProfit(o)).toBe(700);
    expect(friendEarning(o)).toBe(2800);
  });

  it('treats friend_amount 0 as a friend order', () => {
    expect(orderProfit({ ...base, friend_amount: 0 })).toBe(51000);
  });
});

describe('pctLabel', () => {
  it('formats profit as a bracketed percent of order amount', () => {
    expect(pctLabel(700, 50000)).toBe('(1.40%)');
    expect(pctLabel(-500, 10000)).toBe('(-5.00%)');
  });
  it('is empty when there is no order amount', () => {
    expect(pctLabel(0, 0)).toBe('');
  });
});

describe('coupon cashback in profit', () => {
  const base = { order_amount: 1000, return_amount: 1100, cashback: 50 };
  it('adds the coupon by default and when coupon_in_profit is true', () => {
    expect(orderProfit({ ...base, coupon_cashback: 200 })).toBe(350);
    expect(orderProfit({ ...base, coupon_cashback: 200, coupon_in_profit: true })).toBe(350);
  });
  it('excludes the coupon when coupon_in_profit is false', () => {
    expect(orderProfit({ ...base, coupon_cashback: 200, coupon_in_profit: false })).toBe(150);
  });
  it('adds the coupon to friend-order profit without touching the friend earning', () => {
    const o = { ...base, friend_amount: 1050, coupon_cashback: 100 };
    expect(orderProfit(o)).toBe(150);   // 1100 − 1050 + 100
    expect(friendEarning(o)).toBe(100); // 1050 − 1000 + 50
  });
});
