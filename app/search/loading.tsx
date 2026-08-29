// Shown while the ad-hoc TED keyword/CPV/value/deadline search resolves
// (only runs when the query string is non-empty, but the query re-fetches
// on every param change so this still applies to most navigations here).
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="h-3 w-24 bg-paperDim rounded mb-3" />
          <div className="h-8 w-40 bg-paperDim rounded" />
          <div className="h-4 w-96 max-w-full bg-paperDim rounded mt-3" />
        </div>

        <div className="border border-line rounded-doc p-5 mb-8">
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 bg-paperDim rounded-doc" />
            ))}
          </div>
        </div>

        <div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-b border-line py-5">
              <div className="h-3 w-40 bg-paperDim rounded mb-2" />
              <div className="h-5 w-3/4 bg-paperDim rounded mb-2" />
              <div className="h-3 w-24 bg-paperDim rounded" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
