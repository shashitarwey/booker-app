/** "Ravi · HDFC Bank ••4321" — same format as the server's label. */
export const bankLabel = (b) => (b ? `${b.holder_name} · ${b.bank_name}${b.account_last4 ? ` ••${b.account_last4}` : ''}` : '');

/** "Ravi (HDFC Bank ••4321)" — for chips, where " · " separates chips. */
export const bankLabelShort = (b) => (b ? `${b.holder_name} (${b.bank_name}${b.account_last4 ? ` ••${b.account_last4}` : ''})` : '');

/** Turn a server "Holder · Bank" label into the chip-safe form. */
export const chipSafeBankLabel = (label) => {
  const [holder, ...rest] = String(label || '').split(' · ');
  return rest.length ? `${holder} (${rest.join(' · ')})` : holder;
};
