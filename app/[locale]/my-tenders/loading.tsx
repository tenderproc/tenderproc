// Shown while the uploaded-tenders list resolves.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="h-3 w-32 bg-paperDim rounded mb-3" />
            <div className="h-8 w-28 bg-paperDim rounded" />
            <div className="h-4 w-96 max-w-full bg-paperDim rounded mt-3" />
          </div>
          <div className="h-10 w-36 bg-paperDim rounded-doc" />
        </div>

        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start justify-between gap-6 border-b border-line py-5">
            <div className="min-w-0 flex-1">
              <div className="h-5 w-16 bg-paperDim rounded-full mb-2" />
              <div className="h-5 w-3/4 bg-paperDim rounded mb-2" />
              <div className="h-3 w-40 bg-paperDim rounded" />
            </div>
            <div className="text-right shrink-0 w-32">
              <div className="h-2.5 w-14 bg-paperDim rounded mb-2 ml-auto" />
              <div className="h-3.5 w-20 bg-paperDim rounded ml-auto" />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
