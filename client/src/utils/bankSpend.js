// Banks report credit card bills of ₹10 lakh+ per cardholder per financial
// year (SFT → shows in AIS). Add-on spend is billed to the primary's holder.
export const SFT_LIMIT = 1000000;

const holderOf = (c) => String(c.holder_id?._id || c.holder_id || '');

/**
 * Group one holder's cards by bank with spend and the amount billed to them.
 *  - cards:    the holder's cards (from /summary, with total_spend)
 *  - allCards: every card, to find add-ons linked to the holder's primaries
 * Returns [{ name, cards, spend, billed, billedElsewhere: [{ amount, to, last4 }] }],
 * banks with the most spend first; cards inside a bank: primaries first.
 */
export function bankRows(cards, allCards) {
  if (!cards.length) return [];
  const holder = holderOf(cards[0]);
  const byId = new Map(allCards.map(c => [c._id, c]));
  const addonsOf = (primaryId) => allCards.filter(c => c.card_type === 'addon' && String(c.primary_card_id || '') === primaryId);

  const banks = new Map();
  for (const c of cards) {
    if (!banks.has(c.bank_name)) banks.set(c.bank_name, { name: c.bank_name, cards: [], spend: 0, billed: 0, billedElsewhere: [] });
    const b = banks.get(c.bank_name);
    const spend = c.total_spend || 0;
    b.cards.push(c);
    b.spend += spend;
    if (c.card_type !== 'addon') {
      // Primary: own spend + every add-on linked to it (whoever holds them)
      b.billed += spend + addonsOf(c._id).reduce((s, a) => s + (a.total_spend || 0), 0);
    } else {
      const primary = c.primary_card_id ? byId.get(String(c.primary_card_id)) : null;
      if (!primary) b.billed += spend; // unlinked add-on: assume billed to this holder
      else if (holderOf(primary) !== holder && spend > 0) {
        b.billedElsewhere.push({ amount: spend, to: primary.holder_id?.name || 'primary holder', last4: primary.last_four_digit });
      }
    }
  }
  const rows = [...banks.values()];
  for (const r of rows) r.cards.sort((a, b) => (a.card_type === 'addon') - (b.card_type === 'addon'));
  return rows.sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
}
