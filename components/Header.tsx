import Link from "next/link";
import SignOutButton from "./SignOutButton";
import PrimaryNav from "./PrimaryNav";

export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/opportunities" className="flex items-center gap-2">
          <span className="font-display font-semibold text-xl text-ink tracking-tight">
            TenderProc
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-accent bg-accent/10 border border-accent/25 rounded-full px-2 py-0.5">
            Beta
          </span>
        </Link>
        <nav className="text-sm text-inkDim flex items-center gap-5">
          <span className="hidden sm:inline">Belgium · Public tenders</span>
          <Link href="/pricing" className="hover:text-ink transition-colors">
            Pricing
          </Link>
          <SignOutButton />
        </nav>
      </div>
      <PrimaryNav />
    </header>
  );
}
