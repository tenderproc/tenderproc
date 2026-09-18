// Shown while the bids list and each bid's requirements (for the progress
// bar) resolve.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="h-3 w-24 bg-paperDim rounded mb-3" />
          <div className="h-8 w-32 bg-paperDim rounded" />
          <div className="h-4 w-96 max-w-full bg-paperDim rounded mt-3" />
        </div>

        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start justify-between gap-6 border-b border-line py-5">
            <div className="min-w-0 flex-1">
              <div className="h-3 w-24 bg-paperDim rounded mb-2" />
              <div className="h-5 w-3/4 bg-paperDim rounded mb-2" />
              <div className="h-3 w-32 bg-paperDim rounded" />
            </div>
            <div className="w-40 shrink-0">
              <div className="h-3 w-16 bg-paperDim rounded mb-2 ml-auto" />
              <div className="h-4 w-24 bg-paperDim rounded mb-2 ml-auto" />
              <div className="h-1.5 bg-paperDim rounded-full" />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
