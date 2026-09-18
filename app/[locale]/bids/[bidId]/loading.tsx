// Shown while the bid workspace's five parallel queries (tender,
// requirements, warnings, documents, outcome) resolve.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="h-4 w-20 bg-paperDim rounded" />

        <div className="mt-6 mb-8">
          <div className="h-3 w-56 bg-paperDim rounded mb-2" />
          <div className="h-8 w-3/4 bg-paperDim rounded" />
        </div>

        <div className="mb-8">
          <div className="h-3 w-32 bg-paperDim rounded mb-2" />
          <div className="h-2 bg-paperDim rounded-full" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-24 bg-paperDim rounded mb-2" />
              <div className="h-1.5 bg-paperDim rounded-full" />
            </div>
          ))}
        </div>

        <div className="h-5 w-32 bg-paperDim rounded mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-11 border border-line rounded-doc" />
          ))}
        </div>
      </main>
    </div>
  );
}
