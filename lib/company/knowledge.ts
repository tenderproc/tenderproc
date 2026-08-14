import { createClient } from "../supabase/server";
import { CompanyKnowledge } from "../ai/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Builds the distilled, read-only view of a company's knowledge base that
 * gets sent to the AI (see lib/ai/types.ts CompanyKnowledge doc comment).
 * Every field traces back to a row the user entered via /company — nothing
 * here is ever invented by this function or by the AI reading it.
 */
export async function getCompanyKnowledge(
  supabase: SupabaseServerClient,
  userId: string
): Promise<CompanyKnowledge | null> {
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, description, website, company_size, employee_count, regions_served, languages, industries"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!company) return null;

  const [{ data: services }, { data: certifications }, { data: references }] = await Promise.all([
    supabase.from("company_services").select("id, name, description").eq("company_id", company.id),
    supabase
      .from("company_certifications")
      .select("id, name, issuing_organization, expiry_date")
      .eq("company_id", company.id),
    supabase
      .from("company_references")
      .select("id, client, project_name, description, contract_value, is_public, services")
      .eq("company_id", company.id),
  ]);

  return {
    name: company.name,
    description: company.description,
    website: company.website,
    companySize: company.company_size,
    employeeCount: company.employee_count,
    regionsServed: company.regions_served ?? [],
    languages: company.languages ?? [],
    industries: company.industries ?? [],
    services: (services ?? []).map((s: { id: string; name: string; description: string | null }) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
    certifications: (certifications ?? []).map(
      (c: {
        id: string;
        name: string;
        issuing_organization: string | null;
        expiry_date: string | null;
      }) => ({
        id: c.id,
        name: c.name,
        issuingOrganization: c.issuing_organization,
        expiryDate: c.expiry_date,
      })
    ),
    references: (references ?? []).map(
      (r: {
        id: string;
        client: string;
        project_name: string | null;
        description: string | null;
        contract_value: number | null;
        is_public: boolean | null;
        services: string[] | null;
      }) => ({
        id: r.id,
        client: r.client,
        projectName: r.project_name,
        description: r.description,
        contractValue: r.contract_value,
        isPublic: r.is_public,
        services: r.services ?? [],
      })
    ),
  };
}
