/** Realistic Paddle webhook payloads, trimmed from Paddle's own published
 * examples (developer.paddle.com/webhooks/...) to a single subscription
 * item, with custom_data set to how our checkout flow actually populates
 * it. Used wherever a test needs to go through the real SDK's
 * unmarshal()/class construction (which requires the full required-field
 * shape), as opposed to tests that call our own handler functions
 * directly with our own narrower interfaces. */

export function subscriptionCreatedPayload(overrides: Record<string, unknown> = {}) {
  return {
    event_id: "evt_01hv8x2acma2gz7he8kg2s0hna",
    event_type: "subscription.created",
    occurred_at: "2026-01-12T10:18:49.621022Z",
    notification_id: "ntf_01hv8x2af22vrrz7k67g06x1kq",
    data: {
      id: "sub_01hv8x29kz0t586xy6zn1a62ny",
      items: [
        {
          price: {
            id: "pri_01gsz8x8sawmvhz1pv30nge1ke",
            name: "Pro (monthly)",
            type: "standard",
            status: "active",
            quantity: { maximum: 1, minimum: 1 },
            tax_mode: "account_setting",
            created_at: "2023-02-23T13:55:22.538367Z",
            product_id: "pro_01gsz4t5hdjse780zja8vvr7jg",
            unit_price: { amount: "4900", currency_code: "EUR" },
            updated_at: "2024-04-11T13:54:52.254748Z",
            custom_data: null,
            description: "Pro",
            import_meta: null,
            trial_period: null,
            billing_cycle: { interval: "month", frequency: 1 },
            unit_price_overrides: [],
          },
          product: {
            id: "pro_01gsz4t5hdjse780zja8vvr7jg",
            name: "TenderProc Pro",
            type: "standard",
            tax_category: "standard",
            description: "TenderProc Pro subscription",
            image_url: null,
            custom_data: null,
            status: "active",
            import_meta: null,
            created_at: "2023-02-23T12:43:46.605Z",
            updated_at: "2024-04-05T15:53:44.687Z",
          },
          status: "active",
          quantity: 1,
          recurring: true,
          created_at: "2026-01-12T10:18:48.831Z",
          updated_at: "2026-01-12T10:18:48.831Z",
          trial_dates: null,
          next_billed_at: "2026-02-12T10:18:47.635628Z",
          previously_billed_at: null,
        },
      ],
      status: "active",
      discount: null,
      paused_at: null,
      address_id: "add_01hv8gq3318ktkfengj2r75gfx",
      created_at: "2026-01-12T10:18:48.831Z",
      started_at: "2026-01-12T10:18:47.635628Z",
      updated_at: "2026-01-12T10:18:48.831Z",
      business_id: null,
      canceled_at: null,
      custom_data: { supabase_user_id: "11111111-1111-1111-1111-111111111111" },
      customer_id: "ctm_01hv6y1jedq4p1n0yqn5ba3ky4",
      import_meta: null,
      billing_cycle: { interval: "month", frequency: 1 },
      currency_code: "EUR",
      next_billed_at: "2026-02-12T10:18:47.635628Z",
      transaction_id: "txn_01hv8wptq8987qeep44cyrewp9",
      billing_details: null,
      collection_mode: "automatic",
      first_billed_at: "2026-01-12T10:18:47.635628Z",
      scheduled_change: null,
      consent_requirements: [],
      current_billing_period: {
        ends_at: "2026-02-12T10:18:47.635628Z",
        starts_at: "2026-01-12T10:18:47.635628Z",
      },
      ...(overrides.data as object | undefined),
    },
    ...overrides,
  };
}
