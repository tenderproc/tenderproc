import { redirect } from "next/navigation";

// "/profile" is a plausible URL to type or bookmark for the company-profile
// page, but the real route is "/company" (see app/company/page.tsx, which
// already handles the auth redirect to /login if needed) — this used to 404
// instead of landing there.
export default function ProfileRedirectPage() {
  redirect("/company");
}
