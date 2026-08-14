import { PdfExtractor } from "./pdf-extractor";

export interface ExtractedDocument {
  text: string;
  pageCount: number;
}

export interface DocumentExtractor {
  extractText(buffer: Buffer): Promise<ExtractedDocument>;
}

const SUPPORTED_MIME_TYPES = ["application/pdf"];

/**
 * Only PDF is implemented in Phase 1. DOCX/XLSX extractors can be added
 * here later and selected by mime type without changing any call site.
 */
export function getExtractor(mimeType: string): DocumentExtractor {
  if (mimeType === "application/pdf") {
    return new PdfExtractor();
  }
  throw new Error(
    `Unsupported file type: ${mimeType}. Only PDF is supported in this beta.`
  );
}

export function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.includes(mimeType);
}
