import { TenderDetail } from "@/lib/types";
import { getTenderById as getTedTenderById } from "@/lib/ted";
import { getBosaTenderById } from "@/lib/bosa";
import { EXTERNAL_PREFIX, getExternalOpportunityById } from "@/lib/externalOpportunities";

const BOSA_PREFIX = "BOSA:";

/**
 * Source-agnostic dispatcher for the tender detail page — the single
 * entry point app/tenders/[id]/page.tsx (and app/workflow/page.tsx) call
 * instead of reaching into a source-specific module directly. `id` is a
 * bare TED publication-number, a `BOSA:<workspaceId>` id (see
 * lib/bosa.ts's getBosaTenderById), or an `EXT:<source>:<reference>` id
 * for one of the three regional Wallonia/Flanders sources (see
 * lib/externalOpportunities.ts). Adding another source means adding one
 * more branch here, not touching either page.
 */
export async function getTenderById(
  id: string,
  languageKeys?: string[]
): Promise<TenderDetail | null> {
  if (id.startsWith(EXTERNAL_PREFIX)) {
    const [source, ...rest] = id.slice(EXTERNAL_PREFIX.length).split(":");
    return getExternalOpportunityById(source, rest.join(":"));
  }
  if (id.startsWith(BOSA_PREFIX)) {
    return getBosaTenderById(id.slice(BOSA_PREFIX.length));
  }
  return getTedTenderById(id, languageKeys);
}
