import { TenderDetail } from "@/lib/types";
import { getTenderById as getTedTenderById } from "@/lib/ted";
import { getBosaTenderById } from "@/lib/bosa";

const BOSA_PREFIX = "BOSA:";

/**
 * Source-agnostic dispatcher for the tender detail page — the single
 * entry point app/tenders/[id]/page.tsx (and app/workflow/page.tsx) call
 * instead of reaching into a source-specific module directly. `id` is
 * either a bare TED publication-number or a `BOSA:<workspaceId>` id (see
 * lib/bosa.ts's getBosaTenderById, which produces that prefixed id).
 * Adding a third source later means adding one more branch here, not
 * touching either page.
 */
export async function getTenderById(
  id: string,
  languageKeys?: string[]
): Promise<TenderDetail | null> {
  if (id.startsWith(BOSA_PREFIX)) {
    return getBosaTenderById(id.slice(BOSA_PREFIX.length));
  }
  return getTedTenderById(id, languageKeys);
}
