export interface CompanySize {
  key: string;
  label: string;
}

export const COMPANY_SIZES: CompanySize[] = [
  { key: "solo", label: "Solo / freelance" },
  { key: "1-9", label: "1–9 employees" },
  { key: "10-49", label: "10–49 employees" },
  { key: "50-249", label: "50–249 employees" },
];
