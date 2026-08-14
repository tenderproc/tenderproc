import { CompanyKnowledge, EvidenceType, SelectedEvidence } from "../ai/types";

/** Looks up the real detail text for one piece of evidence by type+id —
 * never trusts client-supplied labels/text, only which id was selected. */
export function resolveEvidenceDetail(
  company: CompanyKnowledge,
  type: EvidenceType,
  id: string
): SelectedEvidence | null {
  if (type === "service") {
    const s = company.services.find((x) => x.id === id);
    if (!s) return null;
    return { type, id: s.id, label: s.name, detail: s.description ? `${s.name}: ${s.description}` : s.name };
  }
  if (type === "certification") {
    const c = company.certifications.find((x) => x.id === id);
    if (!c) return null;
    const parts = [c.name];
    if (c.issuingOrganization) parts.push(`issued by ${c.issuingOrganization}`);
    if (c.expiryDate) parts.push(`expires ${c.expiryDate}`);
    return { type, id: c.id, label: c.name, detail: parts.join(", ") };
  }
  const r = company.references.find((x) => x.id === id);
  if (!r) return null;
  const label = `${r.client}${r.projectName ? ` — ${r.projectName}` : ""}`;
  const detailParts = [label];
  if (r.description) detailParts.push(r.description);
  if (r.contractValue) detailParts.push(`value: ${r.contractValue}`);
  if (r.isPublic !== null) detailParts.push(r.isPublic ? "public sector" : "private sector");
  return { type, id: r.id, label, detail: detailParts.join(" — ") };
}

export function resolveEvidenceList(
  company: CompanyKnowledge,
  refs: { type: EvidenceType; id: string }[]
): SelectedEvidence[] {
  return refs
    .map((r) => resolveEvidenceDetail(company, r.type, r.id))
    .filter((e): e is SelectedEvidence => e !== null);
}
