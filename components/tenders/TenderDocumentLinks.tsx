import { getTranslations } from "next-intl/server";

export default async function TenderDocumentLinks({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  const t = await getTranslations("TenderOverview");

  function hostLabel(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  return (
    <div className="border border-line rounded-doc p-4 bg-paperDim">
      <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
        {t("documents")}
      </p>
      <ul className="space-y-1.5">
        {urls.map((url) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent underline break-all"
            >
              {t("viewDocumentsOn", { host: hostLabel(url) })}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
