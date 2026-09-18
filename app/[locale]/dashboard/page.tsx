import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

export default async function DashboardRedirect() {
  redirect({ href: "/opportunities", locale: await getLocale() });
}
