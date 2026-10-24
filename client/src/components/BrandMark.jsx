import { useId } from 'react';

/**
 * Booker logo mark: a shopping bag with a "B" cut out, drawn in currentColor
 * so the badge behind it shows through. Same artwork as public/favicon.svg.
 */
export default function BrandMark({ size = 20 }) {
  const mask = `bm-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="86 92 340 340" aria-hidden="true">
      <mask id={mask}>
        <rect x="86" y="92" width="340" height="340" fill="#fff" />
        <path d="M208 250V380M208 250h50a30 30 0 0 1 0 60h-50M208 310h58a35 35 0 0 1 0 70h-58" fill="none" stroke="#000" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
      </mask>
      <path d="M196 196v-30a60 60 0 0 1 120 0v30" fill="none" stroke="currentColor" strokeWidth="26" strokeLinecap="round" />
      <path d="M150 180H362a18 18 0 0 1 18 17l14 196a26 26 0 0 1-26 28H144a26 26 0 0 1-26-28l14-196a18 18 0 0 1 18-17Z" fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  );
}
