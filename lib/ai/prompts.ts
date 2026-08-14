import { CompanyKnowledge, ExtractedRequirement, TenderAnalysis } from "./types";

/**
 * Shared hallucination-protection rules (spec-mandated wording). Every
 * prompt that touches company data must include this block — never
 * duplicate/paraphrase it elsewhere.
 */
export const BASE_RULES = `You are assisting with a public procurement bid.

Never invent facts about the company.

Only use company information provided in the company knowledge base or
explicitly provided by the user. If information is missing, state that it is
missing — never fill the gap with an assumption.

Never fabricate:
- clients
- references
- certifications
- contract values
- financial figures
- employee counts
- project experience
- qualifications
- performance statistics

When possible, identify the evidence supporting factual claims.

Clearly distinguish:
1. Tender-derived facts
2. Company-derived facts
3. User-provided facts
4. AI suggestions

Generated responses are drafts and require human review.

Never claim eligibility without sufficient evidence.`;

const REQUIREMENT_CATEGORY_LIST =
  "eligibility, administrative, technical, experience, certification, personnel, financial, pricing, document, award_criterion, other";

export function buildTenderAnalysisPrompt(): string {
  return `You extract structured information from Belgian/EU public tender documents
for an SME deciding whether to bid.

You are given the raw extracted text of one or more tender documents. Page
boundaries are marked inline as "--- PAGE n ---" where the extractor could
detect them — use these to fill in sourcePage on requirements when the text
around a requirement falls between two such markers. If no marker is nearby,
use null rather than guessing a page number.

Only extract what is actually present in the text. Never invent a value,
date, quantity, or requirement that isn't stated. If a field (e.g. estimated
value) isn't mentioned, use null — don't estimate it.

Requirement categories (use exactly one of these per requirement):
${REQUIREMENT_CATEGORY_LIST}

Respond ONLY with a JSON object, no other text, matching exactly this shape:
{
  "summary": "2-4 plain-language sentences: what this contract is, who's buying, what's being asked for",
  "contract": {
    "title": "..." | null,
    "contractingAuthority": "..." | null,
    "referenceNumber": "..." | null,
    "location": "..." | null,
    "estimatedValue": 0 | null,
    "currency": "EUR" | null,
    "publicationDate": "YYYY-MM-DD" | null,
    "submissionDeadline": "YYYY-MM-DD" | null,
    "contractDuration": "..." | null
  },
  "awardCriteria": [
    { "criterion": "...", "weight": "e.g. '40%'" | null, "description": "..." | null }
  ],
  "requirements": [
    {
      "title": "short requirement title",
      "description": "..." | null,
      "category": "one of the categories above",
      "mandatory": true,
      "sourcePage": 0 | null,
      "sourceSection": "..." | null
    }
  ],
  "requiredDocuments": ["short document name", ...],
  "risks": ["short risk statement", ...],
  "ambiguities": ["short description of an unclear/conflicting/missing-quantity point in the text", ...]
}

Be thorough on requirements and award criteria — this drives the SME's
whole bid preparation. Be conservative on ambiguities: only flag genuine
gaps or contradictions, not routine boilerplate.`;
}

function formatCompanyKnowledge(company: CompanyKnowledge): string {
  const lines: string[] = [
    `Name: ${company.name}`,
    `Description: ${company.description ?? "not provided"}`,
    `Website: ${company.website ?? "not provided"}`,
    `Company size: ${company.companySize ?? "not provided"}`,
    `Employee count: ${company.employeeCount ?? "not provided"}`,
    `Regions served: ${company.regionsServed.join(", ") || "not provided"}`,
    `Languages: ${company.languages.join(", ") || "not provided"}`,
    `Industries: ${company.industries.join(", ") || "not provided"}`,
  ];

  lines.push(
    company.services.length > 0
      ? `Services:\n${company.services.map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ""}`).join("\n")}`
      : "Services: none on file"
  );

  lines.push(
    company.certifications.length > 0
      ? `Certifications:\n${company.certifications
          .map(
            (c) =>
              `- ${c.name}${c.issuingOrganization ? ` (${c.issuingOrganization})` : ""}${c.expiryDate ? `, expires ${c.expiryDate}` : ""}`
          )
          .join("\n")}`
      : "Certifications: none on file"
  );

  lines.push(
    company.references.length > 0
      ? `References:\n${company.references
          .map(
            (r) =>
              `- ${r.client}${r.projectName ? ` — ${r.projectName}` : ""}${r.description ? `: ${r.description}` : ""}${r.contractValue ? ` (value: ${r.contractValue})` : ""}${r.isPublic === true ? " [public sector]" : r.isPublic === false ? " [private sector]" : ""}`
          )
          .join("\n")}`
      : "References: none on file"
  );

  return lines.join("\n");
}

export function buildBidRecommendationPrompt(): string {
  return `${BASE_RULES}

You produce a Bid/No-Bid recommendation for an SME considering a specific
public tender. You are given the tender's structured analysis (requirements,
award criteria, contract details) and the company's knowledge base (its
services, certifications, references — nothing more, nothing invented).

This is NOT a probability of winning. Score how well the company's profile
fits what the tender is asking for, based only on the company knowledge
base given. If the knowledge base doesn't cover something the tender
requires (e.g. a required certification the company doesn't list), that is
a missing requirement or risk — do not assume the company has it anyway.

Use exactly one of these match labels based on the score:
85-100 "Strong match", 65-84 "Good match", 40-64 "Moderate match", 0-39 "Weak match".

Respond ONLY with a JSON object, no other text, matching exactly this shape:
{
  "score": 0-100,
  "matchLabel": "Strong match" | "Good match" | "Moderate match" | "Weak match",
  "recommendation": "BID" | "CONSIDER" | "NO-BID",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "positiveFactors": ["short factor grounded in the company knowledge base, e.g. 'Comparable reference found: Municipality A'", ...],
  "risks": ["short risk, e.g. 'Required ISO 14001 certification not found in company profile'", ...],
  "missingRequirements": ["requirement title the company profile doesn't yet cover", ...],
  "estimatedEffortHours": { "min": 0, "max": 0 } | null
}

If estimatedEffortHours is included, it is a rough human-verification-required
estimate, not a commitment — label it as such in how you phrase risks/factors
if relevant. The recommendation is advisory; the user makes the final call.`;
}

export function formatTenderAnalysisForPrompt(analysis: TenderAnalysis): string {
  return `Tender summary: ${analysis.summary}

Contract:
- Title: ${analysis.contract.title ?? "unknown"}
- Contracting authority: ${analysis.contract.contractingAuthority ?? "unknown"}
- Estimated value: ${analysis.contract.estimatedValue ?? "unknown"} ${analysis.contract.currency ?? ""}
- Duration: ${analysis.contract.contractDuration ?? "unknown"}
- Deadline: ${analysis.contract.submissionDeadline ?? "unknown"}
- Location: ${analysis.contract.location ?? "unknown"}

Award criteria:
${analysis.awardCriteria.map((c) => `- ${c.criterion}${c.weight ? ` (${c.weight})` : ""}`).join("\n") || "none extracted"}`;
}

export function formatRequirementsForPrompt(requirements: ExtractedRequirement[]): string {
  return requirements
    .map(
      (r) =>
        `- [${r.category}${r.mandatory ? ", mandatory" : ""}] ${r.title}${r.description ? `: ${r.description}` : ""}`
    )
    .join("\n") || "none extracted";
}

export { formatCompanyKnowledge };
