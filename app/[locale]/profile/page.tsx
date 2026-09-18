import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// "/profile" is a plausible URL to type or bookmark for the company-profile
// page, but the real route is "/company" (see app/[locale]/company/page.tsx,
// which already handles the auth redirect to /login if needed) — this used to
// 404 instead of landing there.
export default async function ProfileRedirectPage() {
  redirect({ href: "/company", locale: await getLocale() });
}
