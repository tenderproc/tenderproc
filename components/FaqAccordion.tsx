"use client";

import { useState } from "react";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCategory {
  key: string;
  title: string;
  items: FaqItem[];
}

function AccordionItem({ id, item }: { id: string; item: FaqItem }) {
  const [open, setOpen] = useState(false);
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;

  return (
    <div className="border-b border-line last:border-b-0">
      <h3>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((prev) => !prev)}
          className="w-full flex items-center justify-between gap-4 py-4 text-left font-medium text-ink hover:text-accent transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/40 rounded-doc"
        >
          <span>{item.question}</span>
          <span
            aria-hidden="true"
            className={`shrink-0 text-inkDim transition-transform ${open ? "rotate-45" : ""}`}
          >
            +
          </span>
        </button>
      </h3>
      {open && (
        <div id={panelId} role="region" aria-labelledby={buttonId} className="pb-4 text-sm text-inkDim leading-relaxed">
          {item.answer}
        </div>
      )}
    </div>
  );
}

export default function FaqAccordion({ categories }: { categories: FaqCategory[] }) {
  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <div key={category.key}>
          <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
            {category.title}
          </p>
          <div className="border border-line bg-white rounded-2xl px-5">
            {category.items.map((item, i) => (
              <AccordionItem key={i} id={`faq-${category.key}-${i}`} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
