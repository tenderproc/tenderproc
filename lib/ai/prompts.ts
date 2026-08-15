import {
  CompanyKnowledge,
  ComplianceReviewResponse,
  ExtractedRequirement,
  RequirementForMapping,
  RequirementRef,
  SelectedEvidence,
  TenderAnalysis,
} from "./types";

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

const SCORE_DIMENSION_LIST = `capability_fit, mandatory_requirements, experience,
geographic_fit, financial_eligibility, certification_fit, competition,
preparation_effort, strategic_value`;

export function buildBidRecommendationPrompt(): string {
  return `${BASE_RULES}

You produce a Bid/No-Bid recommendation — the "TenderProc Score" — for an
SME considering a specific public tender. You are given the tender's
structured analysis (requirements, award criteria, contract details) and the
company's knowledge base (its services, certifications, references —
nothing more, nothing invented).

This is NOT a probability of winning. Score how well the company's profile
fits what the tender is asking for, based only on the company knowledge
base given. If the knowledge base doesn't cover something the tender
requires (e.g. a required certification the company doesn't list), that is
a missing requirement or risk — do not assume the company has it anyway.

Use exactly one of these match labels based on the overall score:
85-100 "Strong match", 65-84 "Good match", 40-64 "Moderate match", 0-39 "Weak match".

In addition to the overall score, break it into these named dimensions:
${SCORE_DIMENSION_LIST}

For each dimension, give a 0-100 score and a one-sentence explanation
grounded in what you were actually given. The ONE exception is
"competition": you have NO data about other bidders, historical winners, or
competitive intensity for this tender — you MUST return null for its score
and explain why in unavailableReason (e.g. "No historical bidder data
available for this authority"). Never invent a competition score. For every
other dimension, unavailableReason must be null.

Also identify concrete reasons the company should NOT bid — a
"disqualifyingFactor" for each specific, evidence-grounded gap between a
requirement and the company's known profile (e.g. a mandatory certification
not on file, insufficient turnover if the tender states a minimum, a
geographic restriction the company's regions don't cover). Only mark
something CRITICAL/legally disqualifying if the tender document itself
states it as a hard requirement — do not assume a gap is disqualifying just
because it's a gap. If there is a plausible way to address the gap (e.g. via
subcontracting, or the requirement is ambiguous), say so in
possibleMitigation; otherwise use null. Return an empty array if there are
no genuine disqualifying factors.

Respond ONLY with a JSON object, no other text, matching exactly this shape:
{
  "score": 0-100,
  "matchLabel": "Strong match" | "Good match" | "Moderate match" | "Weak match",
  "recommendation": "BID" | "CONSIDER" | "NO-BID",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "positiveFactors": ["short factor grounded in the company knowledge base, e.g. 'Comparable reference found: Municipality A'", ...],
  "risks": ["short risk, e.g. 'Required ISO 14001 certification not found in company profile'", ...],
  "missingRequirements": ["requirement title the company profile doesn't yet cover", ...],
  "estimatedEffortHours": { "min": 0, "max": 0 } | null,
  "dimensions": [
    { "key": "one of the dimension keys above", "label": "short human label, e.g. 'Capability fit'", "score": 0-100 or null, "explanation": "one sentence", "unavailableReason": null or a short reason (only for competition) }
  ],
  "disqualifyingFactors": [
    {
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "requirement": "the specific requirement text",
      "companyStatus": "what the company profile actually shows, e.g. 'No ISO 14001 certification on file'",
      "evidence": "short pointer to where this comes from, or null",
      "explanation": "why this matters",
      "possibleMitigation": "a plausible way to address it, or null"
    }
  ]
}

Include exactly one entry per dimension key listed above, in that order.
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

// --- Phase 2: evidence finding / response drafting / claim validation ---

function formatRequirementRef(requirement: RequirementRef): string {
  return `[${requirement.category}${requirement.mandatory ? ", mandatory" : ""}] ${requirement.title}${
    requirement.description ? `: ${requirement.description}` : ""
  }`;
}

/** Same content as formatCompanyKnowledge but with each item's id inline,
 * so findCompanyEvidence can reference specific real rows. */
function formatCompanyKnowledgeWithIds(company: CompanyKnowledge): string {
  const lines: string[] = [];

  lines.push(
    company.services.length > 0
      ? `Services:\n${company.services
          .map((s) => `- id=${s.id} name="${s.name}"${s.description ? ` description="${s.description}"` : ""}`)
          .join("\n")}`
      : "Services: none on file"
  );

  lines.push(
    company.certifications.length > 0
      ? `Certifications:\n${company.certifications
          .map(
            (c) =>
              `- id=${c.id} name="${c.name}"${c.issuingOrganization ? ` issuer="${c.issuingOrganization}"` : ""}${c.expiryDate ? ` expires="${c.expiryDate}"` : ""}`
          )
          .join("\n")}`
      : "Certifications: none on file"
  );

  lines.push(
    company.references.length > 0
      ? `References:\n${company.references
          .map(
            (r) =>
              `- id=${r.id} client="${r.client}"${r.projectName ? ` project="${r.projectName}"` : ""}${r.description ? ` description="${r.description}"` : ""}${r.contractValue ? ` value=${r.contractValue}` : ""}${r.isPublic === true ? " sector=public" : r.isPublic === false ? " sector=private" : ""}`
          )
          .join("\n")}`
      : "References: none on file"
  );

  return lines.join("\n");
}

export function buildFindEvidencePrompt(): string {
  return `${BASE_RULES}

You find company evidence relevant to a single tender requirement, so an SME
can decide what to cite when drafting their response.

You are given a requirement and a list of the company's services,
certifications, and references, each with an "id". You may ONLY return ids
that appear in that list — never invent an id, and never return an item that
isn't genuinely relevant just to fill space. If nothing is relevant, return
an empty array.

Respond ONLY with a JSON array, no other text:
[
  {
    "type": "service" | "certification" | "reference",
    "id": "the exact id from the list given",
    "relevance": "High" | "Medium" | "Low",
    "reason": "one short sentence on why this is relevant to the requirement"
  }
]`;
}

export function formatFindEvidenceContext(requirement: RequirementRef, company: CompanyKnowledge): string {
  return `Requirement:\n${formatRequirementRef(requirement)}\n\nCompany evidence available:\n${formatCompanyKnowledgeWithIds(company)}`;
}

function formatSelectedEvidenceForPrompt(evidence: SelectedEvidence[]): string {
  if (evidence.length === 0) return "No evidence selected — draft must say so rather than assume any.";
  return evidence.map((e) => `- [${e.type}] ${e.label}: ${e.detail}`).join("\n");
}

export function buildResponseDraftPrompt(): string {
  return `${BASE_RULES}

You draft a specific, concrete response to one tender requirement (or award
criterion) for an SME's bid, using ONLY the evidence explicitly given to you
plus general company profile facts also given to you. Do not use any
service, certification, or reference that isn't in the evidence provided,
even if it seems like it would exist for a company like this — if the given
evidence doesn't cover part of the requirement, say so in the draft or in
"warnings" rather than writing around the gap.

Write the draft as the company would submit it (first person plural, "we"),
specific to this requirement and citing the given evidence naturally — not
generic filler that could apply to any tender.

Respond ONLY with a JSON object, no other text:
{
  "draft": "the response text",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "warnings": ["short drafting-time caveat, e.g. 'This requirement also asks for a signed declaration, which isn't covered by the draft text'", ...]
}

"warnings" are about coverage gaps in the draft itself, not fact-checking —
a separate pass checks the draft for unsupported claims after this.`;
}

export function formatResponseDraftContext(
  requirement: RequirementRef,
  tenderTitle: string | null,
  contractingAuthority: string | null,
  awardCriterion: { criterion: string; description: string | null } | null,
  evidence: SelectedEvidence[],
  company: CompanyKnowledge
): string {
  return `Tender: ${tenderTitle ?? "unknown"} (${contractingAuthority ?? "unknown authority"})

Requirement:
${formatRequirementRef(requirement)}
${awardCriterion ? `\nRelated award criterion: ${awardCriterion.criterion}${awardCriterion.description ? ` — ${awardCriterion.description}` : ""}` : ""}

Selected evidence to draft from:
${formatSelectedEvidenceForPrompt(evidence)}

Company profile:
${formatCompanyKnowledge(company)}`;
}

export function buildValidateResponsePrompt(): string {
  return `${BASE_RULES}

You review a drafted bid response for factual claims that aren't actually
backed by the evidence/company knowledge it was supposed to be grounded in.
This includes claims that go further than the evidence supports (e.g. the
evidence shows 2 references but the draft says "numerous" or a specific
higher number), named entities not present in the evidence, or figures/dates/
qualifications not present anywhere in the given company knowledge.

Do not flag claims that ARE supported by the evidence or company profile
given, and do not flag stylistic/generic statements that make no verifiable
factual claim (e.g. "we are committed to quality").

Respond ONLY with a JSON object, no other text:
{
  "unsupportedClaims": ["the exact phrase or sentence from the draft that couldn't be verified", ...]
}

If every claim is supported, return an empty array — do not invent an issue
to have something to report.`;
}

export function formatValidateResponseContext(
  draftText: string,
  evidence: SelectedEvidence[],
  company: CompanyKnowledge
): string {
  return `Draft response to check:
"""
${draftText}
"""

Evidence it was supposed to be grounded in:
${formatSelectedEvidenceForPrompt(evidence)}

Full company profile (for cross-checking general facts like size/location):
${formatCompanyKnowledge(company)}`;
}

// --- Phase 3: pre-submission compliance review ---

export function buildComplianceReviewPrompt(): string {
  return `${BASE_RULES}

You review a set of already-drafted bid responses for the SAME bid, looking
ONLY for factual contradictions — not for unsupported claims (a separate,
per-response pass already checks each draft against its evidence
individually; do not repeat that here).

Two kinds of contradiction to look for:
1. Between two or more of the drafted responses (e.g. one response states 5
   dedicated staff, another states 8; one gives a start date that conflicts
   with another).
2. Between a drafted response and the company profile given (e.g. a response
   claims a certification or capability that the company profile doesn't
   list, or a number that doesn't match the profile).

Be conservative: only flag a genuine, specific contradiction you can point
to concretely. Do not flag stylistic variation, differing levels of detail
between responses, or anything you're not confident is an actual conflict.

Respond ONLY with a JSON object, no other text:
{
  "inconsistencies": ["short, specific description of the contradiction and which responses/facts conflict", ...]
}

If there are no genuine contradictions, return an empty array.`;
}

export function formatComplianceReviewContext(
  responses: ComplianceReviewResponse[],
  company: CompanyKnowledge
): string {
  const responseList =
    responses
      .map((r) => `- [${r.category}] ${r.requirementTitle}:\n  """${r.draftText}"""`)
      .join("\n\n") || "No drafted responses yet.";

  return `Drafted responses for this bid:
${responseList}

Company profile:
${formatCompanyKnowledge(company)}`;
}

// --- Increment 1: requirement -> evidence mapping (tender-level, pre-bid) ---

export function buildRequirementEvidenceMappingPrompt(): string {
  return `${BASE_RULES}

You assess, for EVERY tender requirement given, how well the company's
existing evidence (services, certifications, references, each with an "id")
covers it — so an SME can see its evidence gaps before starting to prepare a
bid.

You are given a list of requirements (each with a "requirementId") and the
company's evidence list with real ids. You may ONLY cite ids that appear in
the evidence list — never invent one. You may ONLY return a mapping whose
requirementId is one of the ids given — never invent a requirement.

For each requirement, choose exactly one status:
- VERIFIED: strong, specific evidence clearly covers this requirement
- PARTIAL: some evidence is relevant but doesn't fully cover the requirement
  (e.g. 2 references when 3 are asked for)
- MISSING: no relevant evidence exists in the company's profile
- CONTRADICTED: the company's own evidence appears to conflict with this
  requirement (e.g. a certification listed as expired when the tender
  requires a currently valid one)
- NEEDS_REVIEW: the requirement is ambiguous or evidence is inconclusive and
  a human should look at it directly

Respond ONLY with a JSON object, no other text:
{
  "mappings": [
    {
      "requirementId": "the exact requirementId from the input",
      "status": "VERIFIED" | "PARTIAL" | "MISSING" | "CONTRADICTED" | "NEEDS_REVIEW",
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "notes": "one short sentence explaining the status",
      "evidence": [
        { "type": "service" | "certification" | "reference", "id": "the exact id from the evidence list", "label": "short label, e.g. the service/cert/reference name" }
      ]
    }
  ]
}

Include exactly one mapping per requirement given, in the same order. If a
requirement has no relevant evidence, still include it with status MISSING
and an empty evidence array — do not omit it.`;
}

// --- Increment 2: on-demand AI content translation ---

/** Deliberately does NOT reuse BASE_RULES — that block is an
 * anti-hallucination rule set for generating new company-fact content, not
 * for translating text that already exists. This prompt has a narrower,
 * translation-only job. */
export function buildTranslateFieldsPrompt(targetLanguage: string): string {
  return `You translate structured content into ${targetLanguage} for a Belgian/EU
public-procurement bidding tool.

You are given a JSON object mapping field keys to English source text.
Translate each value into ${targetLanguage}. Do not translate, add, or remove
any keys.

Rules:
- Translate only — do not add, remove, reinterpret, or summarize meaning.
- Preserve every number, date, percentage, and identifier exactly as given.
- Preserve proper nouns (company names, place names, standard names like
  "ISO 9001") untranslated, unless ${targetLanguage} has a standard localized
  form for that specific term.
- If a value is an empty string, return it unchanged.

Respond ONLY with a JSON object, no other text, with exactly the same keys as
the input, each value replaced by its ${targetLanguage} translation.`;
}

export function formatTranslateFieldsContext(fields: Record<string, string>): string {
  return JSON.stringify(fields);
}

export function formatRequirementEvidenceMappingContext(
  requirements: RequirementForMapping[],
  company: CompanyKnowledge
): string {
  const requirementList = requirements
    .map(
      (r) =>
        `- requirementId=${r.id} [${r.category}${r.mandatory ? ", mandatory" : ""}] ${r.title}${
          r.description ? `: ${r.description}` : ""
        }`
    )
    .join("\n");

  return `Requirements:\n${requirementList}\n\nCompany evidence available:\n${formatCompanyKnowledgeWithIds(company)}`;
}
