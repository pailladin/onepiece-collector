-- Supports year windows and first/latest snapshot lookups as history grows.
create index if not exists idx_collection_value_history_user_period_end
  on public.collection_value_history (user_id, period_end);
