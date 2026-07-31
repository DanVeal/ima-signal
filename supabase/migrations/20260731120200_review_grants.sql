-- Phase 2C.2 — service_role grants for the review tables, same reason as
-- every previous phase's trailing grants migration: the blanket
-- `grant all on all tables in schema public to service_role` only applies
-- to tables that exist at the moment it runs.

grant all on public.reviews to service_role;
grant all on public.review_participants to service_role;
grant all on public.comment_threads to service_role;
grant all on public.comments to service_role;
grant all on public.comment_edits to service_role;
grant all on public.comment_thread_resolutions to service_role;
grant all on public.approvals to service_role;
grant all on public.change_requests to service_role;

grant execute on function public.can_comment_on_review(uuid) to authenticated, service_role;
grant execute on function public.can_decide_review(uuid) to authenticated, service_role;
grant execute on function public.ensure_review_participant(uuid, uuid) to authenticated, service_role;
grant execute on function public.current_user_profile_id() to authenticated, service_role;
grant execute on function public.post_comment(uuid, uuid, uuid, boolean, int, int, text, uuid[]) to service_role;
grant execute on function public.edit_comment(uuid, text) to service_role;
grant execute on function public.soft_delete_comment(uuid) to service_role;
grant execute on function public.resolve_thread(uuid) to service_role;
grant execute on function public.reopen_thread(uuid) to service_role;
grant execute on function public.create_approval(uuid, uuid, text, text) to service_role;
grant execute on function public.withdraw_approval(uuid, uuid, text) to service_role;
grant execute on function public.create_change_request(uuid, uuid, text, text, int, text) to service_role;
grant execute on function public.resolve_change_request(uuid, text) to service_role;
grant execute on function public.cancel_change_request(uuid) to service_role;
grant execute on function public.start_review(uuid) to service_role;
grant execute on function public.archive_review(uuid) to service_role;
