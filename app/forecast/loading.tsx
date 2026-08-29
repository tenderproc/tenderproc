// Shown while the sector lookup and the contract_awards re-tender-window
// query (up to 200 rows, service-role client) resolve.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-6">
          <div className="h-3 w-24 bg-paperDim rounded mb-3" />
          <div className="h-8 w-40 bg-paperDim rounded" />
          <div className="h-4 w-96 max-w-full bg-paperDim rounded mt-3" />
        </div>

        <div className="h-16 w-full bg-paperDim rounded-doc mb-6" />

        <div className="flex items-center justify-between mb-6">
          <div className="h-9 w-44 bg-paperDim rounded-doc" />
          <div className="h-3 w-20 bg-paperDim rounded" />
        </div>

        {Array.from({ length: 3 }).map((_, i) => (
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
