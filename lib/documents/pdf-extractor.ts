import { extractText, getDocumentProxy } from "unpdf";
import { DocumentExtractor, ExtractedDocument } from "./extractor";

// Below this many non-whitespace characters per page, a PDF is treated as
// having no usable text layer (e.g. a scanned/image-only document) rather
// than being silently analyzed on almost nothing. OCR is out of scope.
const MIN_CHARS_PER_PAGE = 20;

export class PdfExtractor implements DocumentExtractor {
  async extractText(buffer: Buffer): Promise<ExtractedDocument> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    // mergePages: false gives one string per page, so page markers can be
    // inserted precisely rather than guessed from a combined blob — used
    // for source-page citations in the AI's requirement extraction.
    const { totalPages, text: pages } = await extractText(pdf, { mergePages: false });

    const text = pages
      .map((pageText, i) => `--- PAGE ${i + 1} ---\n${pageText}`)
      .join("\n\n")
      .trim();

    if (totalPages > 0 && text.length < totalPages * MIN_CHARS_PER_PAGE) {
      throw new Error(
        "This PDF has little or no extractable text — it may be a scanned document without a text layer. OCR isn't supported yet."
      );
    }

    return { text, pageCount: totalPages };
  }
}
