import { useId } from "react";

/** Brand mark: simplified geometric brain (same artwork as the app icon). */
export function BrainLogo({ className, tile = false }: { className?: string; tile?: boolean }) {
  const gradientId = useId();
  return (
    <svg viewBox={tile ? "100 100 824 824" : "220 262 584 506"} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="268" x2="0" y2="746">
          <stop offset="0" stopColor="#F97316" />
          <stop offset="1" stopColor="#EA580C" />
        </linearGradient>
      </defs>
      {tile && <rect x="100" y="100" width="824" height="824" rx="186" fill="#FFF7ED" />}
      <g fill={`url(#${gradientId})`}>
        <circle cx="430" cy="372" r="104" />
        <circle cx="336" cy="452" r="108" />
        <circle cx="332" cy="578" r="100" />
        <circle cx="420" cy="650" r="96" />
        <rect x="360" y="330" width="146" height="390" rx="60" />
        <circle cx="594" cy="372" r="104" />
        <circle cx="688" cy="452" r="108" />
        <circle cx="692" cy="578" r="100" />
        <circle cx="604" cy="650" r="96" />
        <rect x="518" y="330" width="146" height="390" rx="60" />
      </g>
      <g fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="26">
        <path d="M512 290 L512 742" />
        <path d="M440 420 C400 420 378 448 380 486" />
        <path d="M300 520 C340 520 372 540 380 576" />
        <path d="M452 548 C420 560 410 600 430 632" />
        <path d="M584 420 C624 420 646 448 644 486" />
        <path d="M724 520 C684 520 652 540 644 576" />
        <path d="M572 548 C604 560 614 600 594 632" />
      </g>
    </svg>
  );
}
