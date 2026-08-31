"use client";

import { useEffect, useRef, useState } from "react";

export type CompanyMatch = {
  enterpriseNumber: string;
  denomination: string;
  startDate: string | null;
};

type Props = {
  value: string;
  onChange: (name: string) => void;
  onSelect: (company: CompanyMatch) => void;
  className: string;
  placeholder?: string;
  required?: boolean;
  /** Forwarded to the underlying input so a native (non-JS) form submission
   * — e.g. signup's hydration-failure fallback — still carries this field. */
  name?: string;
};

// Search-as-you-type over Belgium's KBO company register (app/api/company-search),
// used on the signup form so the user can pick their real registered company
// instead of free-typing a name. Selecting a result doesn't lock the field —
// it's still a plain text input underneath, so free typing (e.g. a company
// not yet in the KBO import) stays possible.
export default function CompanySearchInput({ value, onChange, onSelect, className, placeholder, required, name }: Props) {
  const [results, setResults] = useState<CompanyMatch[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim();
    const timer = setTimeout(async () => {
      if (query.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      try {
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } catch {
        // Best-effort autocomplete — a failed lookup just leaves free typing available.
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        className={className}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto border border-line bg-white rounded-doc shadow-lg">
          {results.map((company) => (
            <li key={company.enterpriseNumber}>
              <button
                type="button"
                onClick={() => {
                  onSelect(company);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-paper transition-colors border-b border-line last:border-b-0"
              >
                <p className="text-sm font-medium text-ink">{company.denomination}</p>
                <p className="text-xs text-inkDim mt-0.5">
                  BE{company.enterpriseNumber}
                  {company.startDate ? ` · ${company.startDate}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
