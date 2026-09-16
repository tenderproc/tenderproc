// Fallback for the <Suspense> boundary around OpportunitiesList (the part of
// the Opportunities page waiting on live TED/BOSA calls) — shown while the
// header, sidebar, and filters above it have already rendered for real.
export default function OpportunitiesListSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="border-b border-line py-5">
          <div className="h-3 w-40 bg-paperDim rounded mb-2" />
          <div className="h-5 w-3/4 bg-paperDim rounded mb-2" />
          <div className="h-3 w-24 bg-paperDim rounded" />
        </div>
      ))}
    </div>
  );
}
