import { DisqualifyingFactor, ScoreDimension } from "@/lib/ai/types";

export interface AiAnalysisExtras {
  requiredDocuments?: string[];
  risks?: string[];
  ambiguities?: string[];
  positiveFactors?: string[];
  recommendationRisks?: string[];
  missingRequirements?: string[];
  estimatedEffortHours?: { min: number; max: number } | null;
}

const EXTRAS_ARRAY_KEYS = [
  "requiredDocuments",
  "risks",
  "ambiguities",
  "positiveFactors",
  "recommendationRisks",
  "missingRequirements",
] as const;

export interface TranslatableTenderSource {
  aiSummary: string | null;
  aiAnalysis: AiAnalysisExtras | null;
  scoreDimensions: ScoreDimension[];
  disqualifyingFactors: DisqualifyingFactor[];
  requirements: { id: string; title: string; description: string | null }[];
  awardCriteria: { id: string; criterion: string; description: string | null }[];
  evidenceNotes: { requirementId: string; notes: string }[];
}

/** Flattens every free-text field worth translating into one {key: text}
 * map — never enums, ids, numbers, or proper-noun-ish fields (title,
 * contracting authority, location, duration), which stay in their original
 * form. The translate API route feeds this straight into
 * AIProvider.translateFields(); trField() below reads it back by the same
 * keys at render time. */
export function extractTranslatableTenderFields(
  source: TranslatableTenderSource
): Record<string, string> {
  const fields: Record<string, string> = {};

  if (source.aiSummary) fields["summary"] = source.aiSummary;

  const extras = source.aiAnalysis ?? {};
  for (const key of EXTRAS_ARRAY_KEYS) {
    (extras[key] ?? []).forEach((text, i) => {
      if (text) fields[`${key}.${i}`] = text;
    });
  }

  source.scoreDimensions.forEach((d, i) => {
    if (d.label) fields[`dimensions.${i}.label`] = d.label;
    if (d.explanation) fields[`dimensions.${i}.explanation`] = d.explanation;
    if (d.unavailableReason) fields[`dimensions.${i}.unavailableReason`] = d.unavailableReason;
  });

  source.disqualifyingFactors.forEach((f, i) => {
    if (f.requirement) fields[`disqualifiers.${i}.requirement`] = f.requirement;
    if (f.companyStatus) fields[`disqualifiers.${i}.companyStatus`] = f.companyStatus;
    if (f.evidence) fields[`disqualifiers.${i}.evidence`] = f.evidence;
    if (f.explanation) fields[`disqualifiers.${i}.explanation`] = f.explanation;
    if (f.possibleMitigation) fields[`disqualifiers.${i}.possibleMitigation`] = f.possibleMitigation;
  });

  for (const r of source.requirements) {
    fields[`requirements.${r.id}.title`] = r.title;
    if (r.description) fields[`requirements.${r.id}.description`] = r.description;
  }

  for (const c of source.awardCriteria) {
    fields[`awardCriteria.${c.id}.criterion`] = c.criterion;
    if (c.description) fields[`awardCriteria.${c.id}.description`] = c.description;
  }

  for (const e of source.evidenceNotes) {
    if (e.notes) fields[`evidenceNotes.${e.requirementId}`] = e.notes;
  }

  return fields;
}

/** Looks up a translated value by the same key extractTranslatableTenderFields
 * used, falling back to the original English text when no cached translation
 * exists yet (including whenever the locale is English). */
export function trField(
  translated: Record<string, string> | null | undefined,
  key: string,
  fallback: string
): string {
  return translated?.[key] || fallback;
}
