"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buildWhatsAppUrl } from "@/lib/supportChat/whatsapp";
import { loadConversation, saveConversation, type StoredChatMessage } from "@/lib/supportChat/storage";

export default function SupportChatWidget() {
  const t = useTranslations("SupportChat");
  const [open, setOpen] = useState(false);
  // Read synchronously from localStorage — safe on the server (returns [])
  // because this data only ever renders once the panel is opened by a
  // client-side click, well after hydration, so there's nothing to mismatch.
  const [messages, setMessages] = useState<StoredChatMessage[]>(() => loadConversation());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [needsHuman, setNeedsHuman] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveConversation(messages);
  }, [messages]);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, sending, open]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    setNeedsHuman(false);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: t("errorFallback") }]);
        setNeedsHuman(true);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setNeedsHuman(Boolean(data.needsHuman));
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("errorFallback") }]);
      setNeedsHuman(true);
    } finally {
      setSending(false);
    }
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const whatsappUrl = buildWhatsAppUrl(lastUserMessage, t("whatsappLeadIn"));

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label={t("title")}
          className="w-[360px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-8rem)] flex flex-col bg-paper border border-line rounded-doc shadow-lg overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-paperDim">
            <p className="font-display font-semibold text-sm text-ink">{t("title")}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="text-inkDim hover:text-ink transition-colors rounded-doc focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <CloseIcon />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 ? (
              <ChatBubble role="assistant">{t("greeting")}</ChatBubble>
            ) : (
              messages.map((m, i) => (
                <ChatBubble key={i} role={m.role}>
                  {m.content}
                </ChatBubble>
              ))
            )}
            {sending && (
              <ChatBubble role="assistant">
                <LoadingDots />
              </ChatBubble>
            )}
          </div>

          {needsHuman && (
            <div className="px-4 pb-3">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-moss text-white py-2.5 rounded-doc font-medium shadow-xs hover:opacity-90 transition-opacity"
              >
                <WhatsAppIcon />
                {t("talkToPerson")}
              </a>
              <p className="text-xs text-inkDim mt-1.5 text-center">{t("operatorHours")}</p>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-center gap-2 px-4 py-3 border-t border-line"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("placeholder")}
              disabled={sending}
              aria-label={t("placeholder")}
              className="flex-1 border border-line rounded-doc px-3 py-2 text-sm bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label={t("send")}
              className="shrink-0 bg-accent text-white p-2.5 rounded-doc shadow-xs hover:bg-accentDim transition-colors disabled:opacity-50"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? t("close") : t("bubbleLabel")}
        aria-expanded={open}
        className="flex items-center justify-center w-14 h-14 rounded-full bg-accent text-white shadow-lg hover:bg-accentDim transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </div>
  );
}

function ChatBubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-doc px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? "bg-accent text-white" : "bg-paperDim text-ink"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-inkDim animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-inkDim animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-inkDim animate-bounce" />
    </span>
  );
}

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5C4 4.67157 4.67157 4 5.5 4H18.5C19.3284 4 20 4.67157 20 5.5V15.5C20 16.3284 19.3284 17 18.5 17H9L5 20.5V17H5.5C4.67157 17 4 16.3284 4 15.5V5.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20L20 12L4 4L4 10L14 12L4 14L4 20Z" fill="currentColor" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.36 5.07L2 22l5.07-1.33A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18.1a8.1 8.1 0 01-4.12-1.13l-.3-.18-3.05.8.82-2.97-.2-.3A8.1 8.1 0 1120.1 12 8.11 8.11 0 0112 20.1zm4.44-6.07c-.24-.12-1.43-.7-1.65-.79-.22-.08-.38-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.17-.7-.63-1.18-1.4-1.31-1.64-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.42-.55-.42-.14 0-.3-.02-.46-.02-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.02 0 1.19.87 2.34.99 2.5.12.16 1.71 2.62 4.15 3.67.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.43-.58 1.63-1.15.2-.56.2-1.04.14-1.15-.06-.1-.22-.16-.46-.28z" />
    </svg>
  );
}
