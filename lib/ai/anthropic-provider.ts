import Anthropic from "@anthropic-ai/sdk";
import { AIProvider } from "./provider";
import {
  buildBidRecommendationPrompt,
  buildTenderAnalysisPrompt,
  formatCompanyKnowledge,
  formatRequirementsForPrompt,
  formatTenderAnalysisForPrompt,
} from "./prompts";
import {
  AnalyzeTenderInput,
  AwardCriterion,
  BidConfidence,
  BidMatchLabel,
  BidRecommendation,
  BidRecommendationVerdict,
  ExtractedRequirement,
  GenerateBidRecommendationInput,
  REQUIREMENT_CATEGORIES,
  RequirementCategory,
  TenderAnalysis,
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
  const parsed = JSON.parse(stripJsonFences(raw));
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
  const parsed = JSON.parse(stripJsonFences(raw));
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
}
