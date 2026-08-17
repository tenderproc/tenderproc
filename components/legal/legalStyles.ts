/** Shared Tailwind classes for the long-form legal pages — there's no
 * prose plugin in this project (see app/globals.css), so this is the one
 * place terms/privacy/refund agree on heading/paragraph/list treatment
 * instead of each re-deriving it. */
export const legalStyles = {
  h2: "font-display font-semibold text-xl text-ink mt-10 mb-3",
  h3: "font-display font-semibold text-base text-ink mt-6 mb-2",
  p: "text-sm text-inkDim leading-relaxed mb-4",
  ul: "list-disc pl-5 text-sm text-inkDim leading-relaxed mb-4 space-y-1.5",
  strong: "text-ink font-medium",
} as const;
