# AI architecture

## Provider abstraction (`lib/ai/`)

```ts
interface AIProvider {
  analyzeTender(input: AnalyzeTenderInput): Promise<TenderAnalysis>;
  generateBidRecommendation(input: GenerateBidRecommendationInput): Promise<BidRecommendation>;
}
```

`getAIProvider()` (`lib/ai/index.ts`) is the single place that decides which implementation
is active — today, always `AnthropicProvider`. Nothing outside `lib/ai/` imports
`@anthropic-ai/sdk` directly except two pre-existing call sites (`lib/scoring.ts`,
`app/api/analyze/route.ts`) that were given a minimal, behavior-preserving swap to the same
`getAnthropicClient()` helper this module exports, so there's exactly one place an Anthropic
client gets constructed.

Only the two methods Phase 1 needs are defined on the interface. The spec's fuller method
list — `findCompanyEvidence()`, `generateResponseDraft()`, `validateResponse()`,
`findTenderAmbiguities()` (ambiguity detection is currently folded into `analyzeTender`'s
output), `runComplianceReview()` — are Phase 2/3 additions to this same interface, not
stubbed out ahead of time.

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

## What's NOT built yet (Phase 2/3)

`findCompanyEvidence`, `generateResponseDraft`, `validateResponse`/unsupported-claim
detection, a standalone "Find ambiguities" action, `runComplianceReview`. These extend the
same `AIProvider` interface and reuse `BASE_RULES` when they land.
