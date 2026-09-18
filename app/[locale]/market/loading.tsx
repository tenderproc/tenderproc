// Shown while the tier check, the 90-day TED awards fetch, and the
// contract_awards market-share query (up to 5,000 rows) resolve.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-6">
          <div className="h-3 w-24 bg-paperDim rounded mb-3" />
          <div className="h-8 w-56 bg-paperDim rounded" />
          <div className="h-4 w-96 max-w-full bg-paperDim rounded mt-3" />
        </div>

        <div className="h-9 w-64 bg-paperDim rounded-doc mb-6" />

        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="border border-line rounded-2xl p-5">
              <div className="h-3 w-28 bg-paperDim rounded mb-3" />
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-3.5 w-full bg-paperDim rounded mb-2" />
              ))}
            </div>
          ))}
        </div>

        <div className="h-3 w-40 bg-paperDim rounded mb-3" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-b border-line py-4">
            <div className="h-3 w-28 bg-paperDim rounded mb-2" />
            <div className="h-4 w-1/2 bg-paperDim rounded mb-2" />
            <div className="h-3 w-2/3 bg-paperDim rounded" />
          </div>
        ))}
      </main>
    </div>
  );
}
