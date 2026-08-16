import type { Locale } from "@/lib/locales";

const FLAGS: Record<Locale, React.ReactNode> = {
  en: (
    <svg viewBox="0 0 60 30" preserveAspectRatio="none" className="w-full h-full">
      <rect width="60" height="30" fill="#00247d" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#cf142b" strokeWidth="2" />
      <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#cf142b" strokeWidth="6" />
    </svg>
  ),
  nl: (
    <svg viewBox="0 0 3 3" preserveAspectRatio="none" className="w-full h-full">
      <rect width="3" height="1" fill="#AE1C28" />
      <rect y="1" width="3" height="1" fill="#fff" />
      <rect y="2" width="3" height="1" fill="#21468B" />
    </svg>
  ),
  fr: (
    <svg viewBox="0 0 3 2" preserveAspectRatio="none" className="w-full h-full">
      <rect width="1" height="2" fill="#002654" />
      <rect x="1" width="1" height="2" fill="#fff" />
      <rect x="2" width="1" height="2" fill="#ED2939" />
    </svg>
  ),
  de: (
    <svg viewBox="0 0 5 3" preserveAspectRatio="none" className="w-full h-full">
      <rect width="5" height="1" fill="#000" />
      <rect y="1" width="5" height="1" fill="#DD0000" />
      <rect y="2" width="5" height="1" fill="#FFCE00" />
    </svg>
  ),
};

export default function FlagIcon({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <span
      className={`inline-block overflow-hidden rounded-[2px] ring-1 ring-black/10 shrink-0 ${className ?? "w-5 h-[14px]"}`}
    >
      {FLAGS[locale]}
    </span>
  );
}
