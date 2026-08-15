import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import CompanyCoreForm from "@/components/company/CompanyCoreForm";
import ServicesSection from "@/components/company/ServicesSection";
import CertificationsSection from "@/components/company/CertificationsSection";
import ReferencesSection from "@/components/company/ReferencesSection";
import DocumentsSection from "@/components/company/DocumentsSection";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CompanyPage() {
  const t = await getTranslations("CompanyPage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/company");

  const [{ data: company }, { data: profile }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, description, website, company_size, employee_count, regions_served, languages, industries"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("company_name, company_description, company_size")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  let services: { id: string; name: string; description: string | null }[] = [];
  let certifications: {
    id: string;
    name: string;
    issuing_organization: string | null;
    certificate_number: string | null;
    issue_date: string | null;
    expiry_date: string | null;
    notes: string | null;
  }[] = [];
  let references: {
    id: string;
    client: string;
    project_name: string | null;
    description: string | null;
    contract_value: number | null;
    is_public: boolean | null;
    services: string[] | null;
  }[] = [];
  let documents: {
    id: string;
    file_name: string;
    storage_path: string;
    file_type: string | null;
    file_size_bytes: number | null;
    uploaded_at: string;
  }[] = [];

  if (company) {
    const [svc, cert, ref, doc] = await Promise.all([
      supabase.from("company_services").select("id, name, description").eq("company_id", company.id),
      supabase
        .from("company_certifications")
        .select("id, name, issuing_organization, certificate_number, issue_date, expiry_date, notes")
        .eq("company_id", company.id),
      supabase
        .from("company_references")
        .select("id, client, project_name, description, contract_value, is_public, services")
        .eq("company_id", company.id),
      supabase
        .from("company_documents")
        .select("id, file_name, storage_path, file_type, file_size_bytes, uploaded_at")
        .eq("company_id", company.id),
    ]);
    services = svc.data ?? [];
    certifications = cert.data ?? [];
    references = ref.data ?? [];
    documents = doc.data ?? [];
  }

  return (
    <div>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
            {t("eyebrow")}
          </p>
          <h1 className="font-display font-bold text-3xl text-ink mt-1 tracking-tight">
            {t("heading")}
          </h1>
          <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">
            {t("description")}
          </p>
        </div>

        <div className="space-y-6">
          <CompanyCoreForm
            userId={user.id}
            hasCompany={Boolean(company)}
            initial={{
              name: company?.name ?? profile?.company_name ?? "",
              description: company?.description ?? profile?.company_description ?? "",
              website: company?.website ?? "",
              companySize: company?.company_size ?? profile?.company_size ?? "",
              employeeCount: company?.employee_count?.toString() ?? "",
              regionsServed: company?.regions_served ?? [],
              languages: company?.languages ?? [],
              industries: company?.industries ?? [],
            }}
          />

          {company ? (
            <>
              <ServicesSection companyId={company.id} initialServices={services} />
              <CertificationsSection companyId={company.id} initialCertifications={certifications} />
              <ReferencesSection companyId={company.id} initialReferences={references} />
              <DocumentsSection
                userId={user.id}
                companyId={company.id}
                initialDocuments={documents}
              />
            </>
          ) : (
            <div className="border border-line rounded-2xl p-6 text-center text-sm text-inkDim">
              {t("unlockHint")}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
