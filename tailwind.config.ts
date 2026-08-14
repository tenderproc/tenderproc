import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FFFFFF",
        paperDim: "#F8FAFC",
        ink: "#0F172A",
        inkDim: "#475569",
        stamp: "#DC2626",
        gold: "#D97706",
        moss: "#16A34A",
        line: "#E2E8F0",
        accent: "#2563EB",
        accentDim: "#1D4ED8",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "sans-serif"],
      },
      borderRadius: {
        doc: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
