alter table public.community_submissions
  drop constraint if exists community_submissions_submission_type_check;

alter table public.community_submissions
  add constraint community_submissions_submission_type_check
  check (submission_type in ('card_edit', 'card_add', 'place_add'));

alter table public.community_submissions
  drop constraint if exists community_submissions_target_type_check;

alter table public.community_submissions
  add constraint community_submissions_target_type_check
  check (target_type in ('card_print', 'new_card', 'place'));
