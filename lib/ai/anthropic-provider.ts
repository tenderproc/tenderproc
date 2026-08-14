import Anthropic from "@anthropic-ai/sdk";
import { AIProvider } from "./provider";
import {
  buildBidRecommendationPrompt,
  buildFindEvidencePrompt,
  buildResponseDraftPrompt,
  buildTenderAnalysisPrompt,
  buildValidateResponsePrompt,
  formatCompanyKnowledge,
  formatFindEvidenceContext,
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
  EvidenceMatch,
  EvidenceRelevance,
  EvidenceType,
  ExtractedRequirement,
  FindCompanyEvidenceInput,
  GenerateBidRecommendationInput,
  GenerateResponseDraftInput,
  REQUIREMENT_CATEGORIES,
  RequirementCategory,
  ResponseDraft,
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
      max_tokens: 2000,
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
