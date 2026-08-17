import LegalHeader from "@/components/legal/LegalHeader";
import LegalFooter from "@/components/legal/LegalFooter";
import { legalStyles as s } from "@/components/legal/legalStyles";
import { LEGAL_ENTITY, LEGAL_DATES } from "@/lib/legal/companyInfo";

export const metadata = { title: "Refund Policy — TenderProc" };

export default function RefundPage() {
  return (
    <div>
      <LegalHeader />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">Legal</p>
        <h1 className="font-display font-bold text-4xl text-ink mt-2 tracking-tight">Refund Policy</h1>
        <p className="text-sm text-inkDim mt-3">Last updated: {LEGAL_DATES.lastUpdated}</p>

        <h2 className={s.h2}>1. How billing works</h2>
        <p className={s.p}>
          The Free plan is never billed. Pro and Premium are monthly subscriptions, charged in advance, and
          processed by <strong className={s.strong}>Paddle</strong>, our payment provider, who acts as the{" "}
          <strong className={s.strong}>Merchant of Record</strong> for these purchases — Paddle is the seller of
          record on your receipt and the party that actually processes the charge.
        </p>

        <h2 className={s.h2}>2. Our refund policy</h2>
        <p className={s.p}>
          We don&apos;t offer automatic refunds. Refund requests are reviewed{" "}
          <strong className={s.strong}>case by case</strong> — email us at{" "}
          <a href={`mailto:${LEGAL_ENTITY.contactEmail}`}>{LEGAL_ENTITY.contactEmail}</a> with your account email
          and the reason for the request, and we&apos;ll review it and get back to you. We&apos;re generally
          receptive to requests raised promptly (for example, shortly after an unwanted renewal, or where the
          Service genuinely didn&apos;t work for you), and we always correct our own mistakes — see below.
        </p>

        <h2 className={s.h2}>3. Charges we always refund</h2>
        <ul className={s.ul}>
          <li>Duplicate charges for the same billing period;</li>
          <li>Charges caused by a verified technical error on our side;</li>
          <li>Any charge that shouldn&apos;t have happened at all — for example, billing after you&apos;d already cancelled.</li>
        </ul>

        <h2 className={s.h2}>4. Cancelling instead of a refund</h2>
        <p className={s.p}>
          You can cancel a subscription anytime from the Billing page in the app. Cancelling stops future renewals
          — your current paid period isn&apos;t refunded, but you keep paid-tier access until it ends, and
          you&apos;re not charged again after that.
        </p>

        <h2 className={s.h2}>5. How an approved refund is paid</h2>
        <p className={s.p}>
          Approved refunds are processed by Paddle back to your original payment method. Depending on your bank
          or card provider, it can take a few business days for the refund to appear on your statement.
        </p>

        <h2 className={s.h2}>6. Chargebacks</h2>
        <p className={s.p}>
          If something&apos;s wrong with a charge, please contact us first — most issues are resolved faster
          directly than through a chargeback, and a chargeback can result in your account being suspended while
          it&apos;s investigated.
        </p>

        <h2 className={s.h2}>7. Your statutory rights</h2>
        <p className={s.p}>
          Nothing in this policy limits any non-waivable right you have under applicable consumer protection law,
          including any statutory right of withdrawal for the purchase of digital services that Paddle&apos;s
          checkout process asks you to acknowledge at the point of purchase.
        </p>

        <h2 className={s.h2}>8. Contact</h2>
        <p className={s.p}>
          Refund requests and questions about this policy:{" "}
          <a href={`mailto:${LEGAL_ENTITY.contactEmail}`}>{LEGAL_ENTITY.contactEmail}</a>.
        </p>
      </main>
      <LegalFooter />
    </div>
  );
}
