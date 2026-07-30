-- Phase 2B — service_role grants for tables created since the Phase 2A
-- grants migration.
--
-- `grant all on all tables in schema public` only applies to tables that
-- exist at the moment it runs — it is not a standing rule for tables
-- created afterwards. Every Phase 2B migration granted `authenticated` its
-- rights table-by-table as each table was created, but missed re-granting
-- `service_role`. Re-running the blanket grant now (idempotent) covers the
-- Standard Radio and PRAMS matrix/import tables added in this phase.

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- authenticated needs execute on the new wording RPC functions too —
-- granted in their own migration already, this is just a defensive re-grant
-- in case of any future function added without an explicit grant.
grant execute on all functions in schema public to authenticated;
