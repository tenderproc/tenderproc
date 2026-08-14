const STYLE: Record<string, string> = {
  PROCESSING: "bg-line/40 border-line text-inkDim",
  ANALYZING: "bg-line/40 border-line text-inkDim",
  READY: "bg-moss/10 border-moss/25 text-moss",
  FAILED: "bg-stamp/10 border-stamp/25 text-stamp",
};

const LABEL: Record<string, string> = {
  PROCESSING: "Processing",
  ANALYZING: "Analyzing",
  READY: "Ready",
  FAILED: "Failed",
};

export default function TenderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold border rounded-full px-2.5 py-1 ${STYLE[status] ?? STYLE.FAILED}`}
    >
      {LABEL[status] ?? status}
    </span>
  );
}
