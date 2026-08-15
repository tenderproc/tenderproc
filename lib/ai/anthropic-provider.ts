import Anthropic from "@anthropic-ai/sdk";
import { AIProvider } from "./provider";
import {
  buildBidRecommendationPrompt,
  buildComplianceReviewPrompt,
  buildFindEvidencePrompt,
  buildRequirementEvidenceMappingPrompt,
  buildResponseDraftPrompt,
  buildTenderAnalysisPrompt,
  buildValidateResponsePrompt,
  formatCompanyKnowledge,
  formatComplianceReviewContext,
  formatFindEvidenceContext,
  formatRequirementEvidenceMappingContext,
  formatRequirementsForPrompt,
  formatResponseDraftContext,
  formatTenderAnalysisForPrompt,
  formatValidateResponseContext,
} from "./prompts";
import {
  AnalyzeTenderInput,
  AwardCriterion,
  BidConfidence,
  BidMatchLabel,
  BidRecommendation,
  BidRecommendationVerdict,
  CompanyKnowledge,
  ComplianceReviewInput,
  ComplianceReviewResult,
  DisqualifierSeverity,
  DisqualifyingFactor,
  EVIDENCE_COVERAGE_STATUSES,
  EvidenceCoverageStatus,
  EvidenceMatch,
  EvidenceRelevance,
  EvidenceType,
  ExtractedRequirement,
  FindCompanyEvidenceInput,
  GenerateBidRecommendationInput,
  GenerateResponseDraftInput,
  MapRequirementEvidenceInput,
  MapRequirementEvidenceResult,
  REQUIREMENT_CATEGORIES,
  RequirementCategory,
  RequirementEvidenceMapping,
  ResponseDraft,
  SCORE_DIMENSION_KEYS,
  ScoreDimension,
  ScoreDimensionKey,
  TenderAnalysis,
  ValidateResponseInput,
  ValidateResponseResult,
} from "./types";

// The one place a raw Anthropic client is constructed in the app — every AI
// call site (this provider, and the existing scoring/eligibility features)
// goes through this instead of instantiating its own client.
let cachedClient: Anthropic | null = null;
export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

const MODEL = "claude-sonnet-4-6";
// Generous but bounded — avoids re-sending an entire long tender document to
// the AI on every call; full text still lives in tender_documents.
const MAX_DOCUMENT_CHARS = 60000;

function stripJsonFences(raw: string): string {
  return raw.replace(/```json|```/g, "").trim();
}

/** Defense in depth beyond "respond with only JSON" prompt wording: if the
 * model appends any prose before/after the JSON value, extract just the
 * outermost {...} or [...] rather than failing the whole parse. Returns
 * `any` like JSON.parse itself — every call site here already does its own
 * defensive field-by-field validation on the result. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonLoosely(raw: string): any {
  const cleaned = stripJsonFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    const candidate =
      arrayMatch && (!objectMatch || arrayMatch.index! < objectMatch.index!)
        ? arrayMatch[0]
        : objectMatch?.[0];
    if (!candidate) throw new Error("Could not parse AI response as JSON.");
    return JSON.parse(candidate);
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asCategory(v: unknown): RequirementCategory {
  return typeof v === "string" && REQUIREMENT_CATEGORIES.includes(v as RequirementCategory)
    ? (v as RequirementCategory)
    : "other";
}

/** Pure, network-free parser — exported so it can be unit tested directly
 * against a raw JSON string without calling the AI. */
export function parseTenderAnalysis(raw: string): TenderAnalysis {
  const parsed = parseJsonLoosely(raw);
  const contract = parsed?.contract ?? {};

  const awardCriteria: AwardCriterion[] = Array.isArray(parsed?.awardCriteria)
    ? parsed.awardCriteria
        .filter((c: unknown) => asString((c as { criterion?: unknown })?.criterion))
        .map((c: { criterion: string; weight?: unknown; description?: unknown }) => ({
          criterion: c.criterion,
          weight: asString(c.weight),
          description: asString(c.description),
        }))
    : [];

  const requirements: ExtractedRequirement[] = Array.isArray(parsed?.requirements)
    ? parsed.requirements
        .filter((r: unknown) => asString((r as { title?: unknown })?.title))
        .map(
          (r: {
            title: string;
            description?: unknown;
            category?: unknown;
            mandatory?: unknown;
            sourcePage?: unknown;
            sourceSection?: unknown;
          }) => ({
            title: r.title,
            description: asString(r.description),
            category: asCategory(r.category),
            mandatory: r.mandatory !== false,
            sourcePage: asNumber(r.sourcePage),
            sourceSection: asString(r.sourceSection),
          })
        )
    : [];

  return {
    summary: asString(parsed?.summary) ?? "",
    contract: {
      title: asString(contract.title),
      contractingAuthority: asString(contract.contractingAuthority),
      referenceNumber: asString(contract.referenceNumber),
      location: asString(contract.location),
      estimatedValue: asNumber(contract.estimatedValue),
      currency: asString(contract.currency),
      publicationDate: asString(contract.publicationDate),
      submissionDeadline: asString(contract.submissionDeadline),
      contractDuration: asString(contract.contractDuration),
    },
    awardCriteria,
    requirements,
    requiredDocuments: asStringArray(parsed?.requiredDocuments),
    risks: asStringArray(parsed?.risks),
    ambiguities: asStringArray(parsed?.ambiguities),
  };
}

const MATCH_LABELS: BidMatchLabel[] = ["Strong match", "Good match", "Moderate match", "Weak match"];
const RECOMMENDATIONS: BidRecommendationVerdict[] = ["BID", "CONSIDER", "NO-BID"];
const CONFIDENCES: BidConfidence[] = ["HIGH", "MEDIUM", "LOW"];

function labelForScore(score: number): BidMatchLabel {
  if (score >= 85) return "Strong match";
  if (score >= 65) return "Good match";
  if (score >= 40) return "Moderate match";
  return "Weak match";
}

const DISQUALIFIER_SEVERITIES: DisqualifierSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const SCORE_DIMENSION_KEY_SET = new Set<string>(SCORE_DIMENSION_KEYS);

/** Dimension scores are defaulted per-item rather than dropping the whole
 * array on one bad entry — a single malformed dimension shouldn't hide the
 * rest of an otherwise-valid scorecard. Any dimension key the model didn't
 * return is filled in as unavailable, so the UI can always render the same
 * fixed set of dimensions in the same order. */
function parseScoreDimensions(v: unknown): ScoreDimension[] {
  const byKey = new Map<ScoreDimensionKey, ScoreDimension>();
  if (Array.isArray(v)) {
    for (const item of v as unknown[]) {
      const d = item as {
        key?: unknown;
        label?: unknown;
        score?: unknown;
        explanation?: unknown;
        unavailableReason?: unknown;
      };
      if (typeof d?.key !== "string" || !SCORE_DIMENSION_KEY_SET.has(d.key)) continue;
      const key = d.key as ScoreDimensionKey;
      // "competition" has no real data source in this app (no competitor/
      // historical intelligence built yet) — enforced in code, not just
      // prompt wording, so the model can never slip a guessed number through.
      const isCompetition = key === "competition";
      byKey.set(key, {
        key,
        label: asString(d.label) ?? key.replace(/_/g, " "),
        score:
          !isCompetition && asNumber(d.score) !== null
            ? Math.max(0, Math.min(100, Math.round(asNumber(d.score)!)))
            : null,
        explanation: asString(d.explanation) ?? "",
        unavailableReason: isCompetition
          ? (asString(d.unavailableReason) ?? "No historical bidder data available.")
          : asString(d.unavailableReason),
      });
    }
  }

  return SCORE_DIMENSION_KEYS.map(
    (key) =>
      byKey.get(key) ?? {
        key,
        label: key.replace(/_/g, " "),
        score: null,
        explanation: "",
        unavailableReason: "Not assessed.",
      }
  );
}

function parseDisqualifyingFactors(v: unknown): DisqualifyingFactor[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item: unknown) => asString((item as { requirement?: unknown })?.requirement))
    .map(
      (item: {
        severity?: unknown;
        requirement: string;
        companyStatus?: unknown;
        evidence?: unknown;
        explanation?: unknown;
        possibleMitigation?: unknown;
      }) => ({
        severity: DISQUALIFIER_SEVERITIES.includes(item.severity as DisqualifierSeverity)
          ? (item.severity as DisqualifierSeverity)
          : "MEDIUM",
        requirement: item.requirement,
        companyStatus: asString(item.companyStatus) ?? "",
        evidence: asString(item.evidence),
        explanation: asString(item.explanation) ?? "",
        possibleMitigation: asString(item.possibleMitigation),
      })
    );
}

/** Pure, network-free parser — exported so it can be unit tested directly. */
export function parseBidRecommendation(raw: string): BidRecommendation {
  const parsed = parseJsonLoosely(raw);
  const score = Math.max(0, Math.min(100, Math.round(asNumber(parsed?.score) ?? 0)));

  const matchLabel = MATCH_LABELS.includes(parsed?.matchLabel) ? parsed.matchLabel : labelForScore(score);
  const recommendation: BidRecommendationVerdict = RECOMMENDATIONS.includes(parsed?.recommendation)
    ? parsed.recommendation
    : "CONSIDER";
  const confidence: BidConfidence = CONFIDENCES.includes(parsed?.confidence) ? parsed.confidence : "LOW";

  const effort = parsed?.estimatedEffortHours;
  const estimatedEffortHours =
    effort && asNumber(effort.min) !== null && asNumber(effort.max) !== null
      ? { min: asNumber(effort.min)!, max: asNumber(effort.max)! }
      : null;

  return {
    score,
    matchLabel,
    recommendation,
    confidence,
    positiveFactors: asStringArray(parsed?.positiveFactors),
    risks: asStringArray(parsed?.risks),
    missingRequirements: asStringArray(parsed?.missingRequirements),
    estimatedEffortHours,
    dimensions: parseScoreDimensions(parsed?.dimensions),
    disqualifyingFactors: parseDisqualifyingFactors(parsed?.disqualifyingFactors),
  };
}

const EVIDENCE_TYPES: EvidenceType[] = ["service", "certification", "reference"];
const RELEVANCE_LEVELS: EvidenceRelevance[] = ["High", "Medium", "Low"];

function evidenceIdSet(company: CompanyKnowledge): Set<string> {
  return new Set([
    ...company.services.map((s) => s.id),
    ...company.certifications.map((c) => c.id),
    ...company.references.map((r) => r.id),
  ]);
}

/** Pure, network-free parser — exported so it can be unit tested directly.
 * `validIds` enforces the "never invent evidence" rule in code: any id the
 * model returns that doesn't match a real company row is dropped, even if
 * the model claims a type/relevance for it. */
export function parseEvidenceMatches(raw: string, validIds: Set<string>): EvidenceMatch[] {
  const parsed = parseJsonLoosely(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((m: unknown) => {
      const item = m as { type?: unknown; id?: unknown };
      return (
        typeof item?.id === "string" &&
        validIds.has(item.id) &&
        EVIDENCE_TYPES.includes(item.type as EvidenceType)
      );
    })
    .map((m: { type: EvidenceType; id: string; relevance?: unknown; reason?: unknown }) => ({
      type: m.type,
      id: m.id,
      label: "", // filled in by the caller from the real company row, not trusted from the model
      relevance: RELEVANCE_LEVELS.includes(m.relevance as EvidenceRelevance)
        ? (m.relevance as EvidenceRelevance)
        : "Low",
      reason: asString(m.reason) ?? "",
    }));
}

/** Pure, network-free parser — exported so it can be unit tested directly. */
export function parseResponseDraft(raw: string): ResponseDraft {
  const parsed = parseJsonLoosely(raw);
  const confidence: BidConfidence = CONFIDENCES.includes(parsed?.confidence) ? parsed.confidence : "LOW";
  return {
    draft: asString(parsed?.draft) ?? "",
    confidence,
    warnings: asStringArray(parsed?.warnings),
  };
}

/** Pure, network-free parser — exported so it can be unit tested directly. */
export function parseValidateResponse(raw: string): ValidateResponseResult {
  const parsed = parseJsonLoosely(raw);
  return { unsupportedClaims: asStringArray(parsed?.unsupportedClaims) };
}

/** Pure, network-free parser — exported so it can be unit tested directly. */
export function parseComplianceReview(raw: string): ComplianceReviewResult {
  const parsed = parseJsonLoosely(raw);
  return { inconsistencies: asStringArray(parsed?.inconsistencies) };
}

const EVIDENCE_COVERAGE_STATUS_SET = new Set<string>(EVIDENCE_COVERAGE_STATUSES);

/** Pure, network-free parser — exported so it can be unit tested directly.
 * `validEvidenceIds` and `validRequirementIds` enforce "never invent" in
 * code on both axes: a mapping for a requirement id that wasn't in the
 * input is dropped entirely, and any evidence item citing an id that isn't
 * a real company row is dropped from that mapping's evidence list. */
export function parseRequirementEvidenceMapping(
  raw: string,
  validEvidenceIds: Set<string>,
  validRequirementIds: Set<string>
): MapRequirementEvidenceResult {
  const parsed = parseJsonLoosely(raw);
  const rawMappings = Array.isArray(parsed?.mappings) ? parsed.mappings : [];

  const mappings: RequirementEvidenceMapping[] = rawMappings
    .filter(
      (m: unknown) =>
        typeof (m as { requirementId?: unknown })?.requirementId === "string" &&
        validRequirementIds.has((m as { requirementId: string }).requirementId)
    )
    .map(
      (m: {
        requirementId: string;
        status?: unknown;
        confidence?: unknown;
        notes?: unknown;
        evidence?: unknown;
      }) => ({
        requirementId: m.requirementId,
        status: EVIDENCE_COVERAGE_STATUS_SET.has(m.status as string)
          ? (m.status as EvidenceCoverageStatus)
          : "NEEDS_REVIEW",
        confidence: CONFIDENCES.includes(m.confidence as BidConfidence)
          ? (m.confidence as BidConfidence)
          : "LOW",
        notes: asString(m.notes) ?? "",
        evidence: Array.isArray(m.evidence)
          ? m.evidence
              .filter((e: unknown) => {
                const item = e as { type?: unknown; id?: unknown };
                return (
                  typeof item?.id === "string" &&
                  validEvidenceIds.has(item.id) &&
                  EVIDENCE_TYPES.includes(item.type as EvidenceType)
                );
              })
              .map((e: { type: EvidenceType; id: string; label?: unknown }) => ({
                type: e.type,
                id: e.id,
                label: asString(e.label) ?? "",
              }))
          : [],
      })
    );

  return { mappings };
}

export class AnthropicProvider implements AIProvider {
  async analyzeTender(input: AnalyzeTenderInput): Promise<TenderAnalysis> {
    const client = getAnthropicClient();
    const documentText = input.documentText.slice(0, MAX_DOCUMENT_CHARS);

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: buildTenderAnalysisPrompt(),
      messages: [
        {
          role: "user",
          content: `Tender document${input.fileName ? ` (${input.fileName})` : ""}:\n\n${documentText}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
    return parseTenderAnalysis(raw);
  }

  async generateBidRecommendation(
    input: GenerateBidRecommendationInput
  ): Promise<BidRecommendation> {
    const client = getAnthropicClient();

    const userContent = `${formatTenderAnalysisForPrompt(input.tenderAnalysis)}

Requirements:
${formatRequirementsForPrompt(input.requirements)}

Company knowledge base:
${formatCompanyKnowledge(input.company)}`;

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: buildBidRecommendationPrompt(),
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
    return parseBidRecommendation(raw);
  }

  async findCompanyEvidence(input: FindCompanyEvidenceInput): Promise<EvidenceMatch[]> {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: buildFindEvidencePrompt(),
      messages: [
        { role: "user", content: formatFindEvidenceContext(input.requirement, input.company) },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "[]";
    const matches = parseEvidenceMatches(raw, evidenceIdSet(input.company));
    return matches.map((m) => ({ ...m, label: labelForEvidence(input.company, m.type, m.id) }));
  }

  async generateResponseDraft(input: GenerateResponseDraftInput): Promise<ResponseDraft> {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: buildResponseDraftPrompt(),
      messages: [
        {
          role: "user",
          content: formatResponseDraftContext(
            input.requirement,
            input.tenderTitle,
            input.contractingAuthority,
            input.awardCriterion,
            input.evidence,
            input.company
          ),
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
    return parseResponseDraft(raw);
  }

  async validateResponse(input: ValidateResponseInput): Promise<ValidateResponseResult> {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: buildValidateResponsePrompt(),
      messages: [
        {
          role: "user",
          content: formatValidateResponseContext(input.draftText, input.evidence, input.company),
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
    return parseValidateResponse(raw);
  }

  async runComplianceReview(input: ComplianceReviewInput): Promise<ComplianceReviewResult> {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: buildComplianceReviewPrompt(),
      messages: [
        {
          role: "user",
          content: formatComplianceReviewContext(input.responses, input.company),
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
    return parseComplianceReview(raw);
  }

  async mapRequirementsToEvidence(
    input: MapRequirementEvidenceInput
  ): Promise<MapRequirementEvidenceResult> {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: buildRequirementEvidenceMappingPrompt(),
      messages: [
        {
          role: "user",
          content: formatRequirementEvidenceMappingContext(input.requirements, input.company),
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
    const validEvidenceIds = evidenceIdSet(input.company);
    const validRequirementIds = new Set(input.requirements.map((r) => r.id));
    const result = parseRequirementEvidenceMapping(raw, validEvidenceIds, validRequirementIds);
    return {
      mappings: result.mappings.map((m) => ({
        ...m,
        evidence: m.evidence.map((e) => ({ ...e, label: labelForEvidence(input.company, e.type, e.id) })),
      })),
    };
  }
}

function labelForEvidence(company: CompanyKnowledge, type: EvidenceType, id: string): string {
  if (type === "service") {
    return company.services.find((s) => s.id === id)?.name ?? "";
  }
  if (type === "certification") {
    return company.certifications.find((c) => c.id === id)?.name ?? "";
  }
  const ref = company.references.find((r) => r.id === id);
  return ref ? `${ref.client}${ref.projectName ? ` — ${ref.projectName}` : ""}` : "";
}
