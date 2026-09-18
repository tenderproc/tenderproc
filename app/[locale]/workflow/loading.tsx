// Shown while the subscription-tier check and the pipeline_items + tender
// lookups (one getTenderById per card) resolve.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="h-3 w-24 bg-paperDim rounded mb-3" />
          <div className="h-8 w-48 bg-paperDim rounded" />
          <div className="h-4 w-96 max-w-full bg-paperDim rounded mt-3" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, col) => (
            <div key={col}>
              <div className="h-3 w-20 bg-paperDim rounded mb-3" />
              {col === 0 &&
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="border border-line rounded-doc p-3 mb-3">
                    <div className="h-4 w-full bg-paperDim rounded mb-2" />
                    <div className="h-3 w-2/3 bg-paperDim rounded" />
                  </div>
                ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
