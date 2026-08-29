// Shown while TED, BOSA, and the regional sources (Promise.allSettled, plus
// the subscription/profile lookups gating sector count) resolve.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row gap-8">
        <div className="hidden md:block w-56 shrink-0 space-y-4">
          <div className="h-3 w-16 bg-paperDim rounded" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 w-full bg-paperDim rounded" />
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-8">
            <div className="h-3 w-24 bg-paperDim rounded mb-3" />
            <div className="h-8 w-64 bg-paperDim rounded" />
            <div className="h-4 w-96 max-w-full bg-paperDim rounded mt-3" />
          </div>

          <div className="h-11 w-full bg-paperDim rounded-doc mb-8" />

          <div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border-b border-line py-5">
                <div className="h-3 w-40 bg-paperDim rounded mb-2" />
                <div className="h-5 w-3/4 bg-paperDim rounded mb-2" />
                <div className="h-3 w-24 bg-paperDim rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
