-- Adds a dedicated "can someone actually bid on this today" classification
-- to external_opportunities, separate from the existing notice_kind column.
--
-- notice_kind ('open'/'awarded'/'unclear') already exists but answers a
-- different question: it's a dedup/novelty heuristic from the sibling
-- scraper project (wallonia_scraper/notice_kind.py) asking "will this
-- eventually get its own TED/BOSA notice, or was it already decided
-- without competition" - 'open' there means "mentions EU-threshold
-- publicity language", which is a signal about a FUTURE notice elsewhere,
-- not proof this record itself is a live, actionable call right now. It's
-- also dual-written to contract_awards for incumbent-screening, so its
-- meaning can't be repurposed without breaking that.
--
-- bid_status is the new, narrower question the Opportunities page actually
-- needs answered: "reading only this record, could an outside company
-- respond to a call for bids today?" Populated by
-- wallonia_scraper/classify_bid_status.py - cheap marker short-circuits
-- for the confidently-non-biddable cases already proven out in
-- lib/externalOpportunities.ts (draft, negotiated-without-publication,
-- closed shortlist, named award, empty description), an LLM call (Claude
-- Haiku) for the genuinely ambiguous remainder. NULL means "not yet
-- classified" - treated as excluded on the product read side, same
-- fail-closed default as an unconfirmed record.
alter table public.external_opportunities
  add column bid_status text check (bid_status in ('open_call', 'not_biddable', 'unclear')),
  add column bid_status_reason text,
  add column bid_status_source text check (bid_status_source in ('marker', 'llm')),
  add column bid_status_classified_at timestamptz;

create index on public.external_opportunities (bid_status);
