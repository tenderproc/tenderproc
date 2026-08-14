# AI architecture

## Provider abstraction (`lib/ai/`)

```ts
interface AIProvider {
  analyzeTender(input: AnalyzeTenderInput): Promise<TenderAnalysis>;
  generateBidRecommendation(input: GenerateBidRecommendationInput): Promise<BidRecommendation>;
  findCompanyEvidence(input: FindCompanyEvidenceInput): Promise<EvidenceMatch[]>;
  generateResponseDraft(input: GenerateResponseDraftInput): Promise<ResponseDraft>;
  validateResponse(input: ValidateResponseInput): Promise<ValidateResponseResult>;
  runComplianceReview(input: ComplianceReviewInput): Promise<ComplianceReviewResult>;
}
```

`getAIProvider()` (`lib/ai/index.ts`) is the single place that decides which implementation
is active — today, always `AnthropicProvider`. Nothing outside `lib/ai/` imports
`@anthropic-ai/sdk` directly except two pre-existing call sites (`lib/scoring.ts`,
`app/api/analyze/route.ts`) that were given a minimal, behavior-preserving swap to the same
`getAnthropicClient()` helper this module exports, so there's exactly one place an Anthropic
client gets constructed.

Phase 1 added `analyzeTender`/`generateBidRecommendation`; Phase 2 added the three evidence/
drafting/validation methods; Phase 3 adds `runComplianceReview()` below. `findTenderAmbiguities()`
remains unbuilt — ambiguity detection is still folded into `analyzeTender`'s output and
hasn't needed to be a standalone action.

Adding a second provider (e.g. OpenAI) means writing `lib/ai/openai-provider.ts`
implementing `AIProvider` and switching what `getAIProvider()` returns (e.g. behind an
`AI_PROVIDER` env var) — no call site changes.

## Shared prompt rules (`lib/ai/prompts.ts`)

Every prompt that touches company data includes `BASE_RULES`, verbatim:

> You are assisting with a public procurement bid. Never invent facts about the company.
> Only use company information provided in the company knowledge base or explicitly
> provided by the user. If information is missing, state that it is missing. Never
> fabricate: clients, references, certifications, contract values, financial figures,
> employee counts, project experience, qualifications, performance statistics. When
> possible, identify the evidence supporting factual claims. Clearly distinguish:
> 1. Tender-derived facts 2. Company-derived facts 3. User-provided facts 4. AI
> suggestions. Generated responses are drafts and require human review. Never claim
> eligibility without sufficient evidence.

This constant is defined once and must not be paraphrased elsewhere. `analyzeTender`'s
prompt doesn't need it (it only reasons about the tender document, no company data), but
carries its own equivalent instruction: never invent a value/date/requirement not actually
present in the extracted text.

## `analyzeTender()`

Input: extracted tender text (page-marked, see `docs/architecture.md`), capped at ~60k
characters before being sent to the model (full text is still stored in
`tender_documents.extracted_text`). Output: `TenderAnalysis` — summary, contract fields,
award criteria, categorized requirements (with `sourcePage`/`sourceSection` when the text
around them falls near a page marker), required documents, risks, ambiguities. Parsed and
defensively validated by `parseTenderAnalysis()` (`lib/ai/anthropic-provider.ts`) — every
field falls back to `null`/`[]` rather than throwing on a malformed or partial response;
unrecognized requirement categories fall back to `"other"` instead of being dropped.
Unit-tested in `tests/ai/parsers.test.ts`.

## `generateBidRecommendation()`

Input: the `TenderAnalysis` + extracted requirements + `CompanyKnowledge` (the distilled,
read-only view of a company's `companies`/`company_services`/`company_certifications`/
`company_references` rows — see `lib/company/knowledge.ts`; nothing in this object was ever
invented, so it's the only source of "company facts" this call may use). Output:
`BidRecommendation` — score (0-100), qualitative label, `BID`/`CONSIDER`/`NO-BID`,
confidence, positive factors, risks, missing requirements, an optional effort estimate
(always to be displayed as "ESTIMATE — HUMAN VERIFICATION REQUIRED"). Parsed by
`parseBidRecommendation()`, clamps the score into range and falls back invalid
label/recommendation/confidence values to safe defaults rather than propagating garbage.

Per spec: **this is not a probability of winning.** Match labels use exactly
`Strong match` / `Good match` / `Moderate match` / `Weak match` (85+/65+/40+/below), banded
in code (`labelForScore()`), not left to the model's wording.

If no `companies` row exists yet, this step is skipped entirely (not called with empty
data) — the tender detail page shows a prompt to complete the company profile instead of a
score.

## A second, older match-score system

`lib/scoring.ts` (`scoreTenders`) is a separate, pre-existing feature that scores the *live
TED feed* against `profiles` — metadata-only (title/CPV/buyer/value; no document text, no
company knowledge base), one batched call per page load, cached in `tender_scores`. Its
match labels are worded slightly differently (`Strong/Good/Possible/Weak match`). This is a
known, deliberate inconsistency — not unified with the Bid/No-Bid system in Phase 1, since
they answer different questions (quick browse-time triage vs. a deep, requirements-grounded
recommendation) and unifying them wasn't necessary for either to work correctly.

## `findCompanyEvidence()`

Input: one requirement (`RequirementRef`) + `CompanyKnowledge`. `CompanyKnowledge`'s
services/certifications/references each now carry an `id` (added this phase, non-breaking —
the Phase 1 formatters just ignore it) so the model can reference real rows.
`formatFindEvidenceContext()` lists every service/certification/reference with its id
inline; the prompt explicitly says only ids from that list may be returned.

Output: `EvidenceMatch[]` — `{ type, id, label, relevance, reason }`. **The hallucination
protection here isn't just prompt wording**: `parseEvidenceMatches(raw, validIds)`
(`lib/ai/anthropic-provider.ts`) takes the actual set of real ids and drops any returned
match whose id isn't in it, even if the model's prose looks confident. `label` is never
taken from the model either — the route re-derives it from the real company row
(`labelForEvidence()`) after parsing. Unit-tested in `tests/ai/phase2-parsers.test.ts`,
including a case that asserts a fabricated id is dropped.

## `generateResponseDraft()`

Input: the requirement, light tender context (title/authority), an optional award
criterion, and `SelectedEvidence[]` — the evidence the *user* picked from
`findCompanyEvidence`'s results, re-resolved server-side to its full detail text
(`lib/company/evidence.ts`'s `resolveEvidenceList()`) rather than trusted from the client.
The prompt is explicit that it may not use any service/certification/reference outside the
given evidence, even ones that would plausibly exist for a company like this.

Output: `ResponseDraft` — `{ draft, confidence, warnings }`. `warnings` here are
drafting-time coverage gaps ("this also asks for a signed declaration"), not fact-checking —
that's a deliberately separate concern, per the spec's own separate method list.

## `validateResponse()`

Input: draft text + the same `SelectedEvidence[]` + `CompanyKnowledge`. Output:
`{ unsupportedClaims: string[] }` — the exact phrases in the draft that aren't backed by the
evidence/company knowledge given. Called twice in the UI flow: automatically right after
`generateResponseDraft` (`POST /api/bids/[bidId]/requirements/[reqId]/generate-draft`), and
again whenever the user manually edits the draft and clicks "Save & Re-check"
(`POST .../recheck`) — the latter is what makes "insert an unsupported claim, see it
flagged" work on a hand-edited draft, not just a freshly generated one. Each pass replaces
that response's `OPEN unsupported_claim` rows in `bid_warnings` rather than accumulating
stale ones.

## `runComplianceReview()`

Deliberately the narrowest method in the interface. Everything the spec's pre-submission
review asks for that's already sitting in the database as structured rows — unanswered
mandatory requirements, missing documents, open unsupported-claim warnings, the compliance
score itself — is computed directly in `app/api/bids/[bidId]/review/route.ts`, not asked of
the model. Counting rows is exact and free; asking an LLM to also compute a percentage it
isn't reliable at would just add noise and cost.

The one thing that genuinely needs language understanding is cross-response consistency:
did two different drafted responses state conflicting facts (5 staff vs. 8 staff), or does
a response claim something the company profile doesn't support. Input: every drafted
`bid_responses.draft_text` for the bid (title + category + text) plus `CompanyKnowledge`.
Output: `{ inconsistencies: string[] }`, parsed by `parseComplianceReview()` the same
defensive way as every other parser here. The prompt explicitly tells the model not to
re-flag unsupported claims — that's `validateResponse`'s job, already run per-response at
draft time — keeping the two AI checks non-overlapping.

If there's no company profile yet, or no drafted responses to compare, the route skips the
AI call entirely (not called with empty/meaningless input) — the deterministic parts of the
review are still useful on their own.

## Cost control

- Extracted PDF text is stored once (`tender_documents.extracted_text`) and reused, never
  re-extracted.
- Text sent to the model is capped (~60k chars) rather than growing unbounded with document
  size; real chunking/RAG-style retrieval is a documented future improvement, not built.
- `analyzeTender` and `generateBidRecommendation` are separate calls specifically so a
  recommendation can be recomputed later (e.g. after the company profile changes) without
  re-running the more expensive full-document extraction.
- One model (`claude-sonnet-4-6`) is used everywhere in this phase — no multi-model routing
  yet, per "keep the first implementation simple."

## What's NOT built yet

A standalone "Find ambiguities" action — ambiguity detection stays folded into
`analyzeTender`'s output; nothing has needed it to be its own AI call.
