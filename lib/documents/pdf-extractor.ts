import pdfParse from "pdf-parse";
import { DocumentExtractor, ExtractedDocument } from "./extractor";

// Below this many non-whitespace characters per page, a PDF is treated as
// having no usable text layer (e.g. a scanned/image-only document) rather
// than being silently analyzed on almost nothing. OCR is out of scope.
const MIN_CHARS_PER_PAGE = 20;

export class PdfExtractor implements DocumentExtractor {
  async extractText(buffer: Buffer): Promise<ExtractedDocument> {
    let pageNumber = 0;

    const result = await pdfParse(buffer, {
      // Called once per page, in order; prefixing each page's text with a
      // marker lets the AI (and future evidence UI) cite approximate page
      // numbers even though pdf-parse doesn't expose per-page boundaries
      // in its default `text` output.
      pagerender: async (pageData: {
        getTextContent: (opts: {
          normalizeWhitespace: boolean;
          disableCombineTextItems: boolean;
        }) => Promise<{ items: { str: string; transform: number[] }[] }>;
      }) => {
        pageNumber += 1;
        const content = await pageData.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        });
        let lastY: number | undefined;
        let text = "";
        for (const item of content.items) {
          if (lastY === item.transform[5] || lastY === undefined) {
            text += item.str;
          } else {
            text += `\n${item.str}`;
          }
          lastY = item.transform[5];
        }
        return `--- PAGE ${pageNumber} ---\n${text}`;
      },
    });

    const text = result.text.trim();
    const pageCount = result.numpages;

    if (pageCount > 0 && text.length < pageCount * MIN_CHARS_PER_PAGE) {
      throw new Error(
        "This PDF has little or no extractable text — it may be a scanned document without a text layer. OCR isn't supported yet."
      );
    }

    return { text, pageCount };
  }
}
