/** Falls back to a title-cased version of the raw enum for any category not
 * yet in the message catalog, rather than throwing — same defensive posture
 * as the rest of this app's label lookups. */
export function requirementCategoryLabel(category: string, t: (key: string) => string): string {
  try {
    return t(category);
  } catch {
    return category.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}
