"use client";

import { useState } from "react";

const TRUNCATE_AT = 320;

export default function ExpandableText({
  text,
  readMoreLabel,
  readLessLabel,
}: {
  text: string;
  readMoreLabel: string;
  readLessLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > TRUNCATE_AT;
  const shown = expanded || !needsTruncation ? text : `${text.slice(0, TRUNCATE_AT).trimEnd()}…`;

  return (
    <div>
      <p className="text-sm text-ink leading-relaxed whitespace-pre-line">{shown}</p>
      {needsTruncation && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs font-medium text-accent hover:underline mt-1.5"
        >
          {expanded ? readLessLabel : readMoreLabel}
        </button>
      )}
    </div>
  );
}
