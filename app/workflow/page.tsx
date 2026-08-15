import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import WorkflowBoard from "@/components/WorkflowBoard";
import { getTenderById } from "@/lib/ted";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorkflowPage() {
  const t = await getTranslations("WorkflowPage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let cards: { pipelineId: string; stage: string; tender: Awaited<ReturnType<typeof getTenderById>> }[] = [];
  if (user) {
    const { data: items } = await supabase
      .from("pipeline_items")
      .select("id, publication_number, stage")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    cards = await Promise.all(
      (items ?? []).map(async (item) => ({
        pipelineId: item.id as string,
        stage: item.stage as string,
        tender: await getTenderById(item.publication_number).catch(() => null),
      }))
    );
  }

  return (
    <div>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-10">
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

        <WorkflowBoard cards={cards} />
      </main>
    </div>
  );
}
