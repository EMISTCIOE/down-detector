-- Retention for status_checks: keep only the most recent 30 days
-- This migration adds a trigger that, after each insert, removes
-- rows older than 30 days. It reuses the cleanup function defined in schema.sql.

-- Safe to re-run
CREATE OR REPLACE FUNCTION enforce_status_checks_retention_tg()
RETURNS trigger AS $$
BEGIN
  -- Delete any status_check records older than 30 days
  PERFORM cleanup_old_status_checks();
  RETURN NULL; -- AFTER trigger return value is ignored
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS status_checks_retention ON status_checks;
CREATE TRIGGER status_checks_retention
AFTER INSERT ON status_checks
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_status_checks_retention_tg();

-- Optional (if you have pg_cron or a scheduler):
-- Run daily cleanup as a safety net, in case inserts are infrequent.
-- Uncomment if pg_cron is available.
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('status_checks_daily_cleanup', '0 3 * * *', $$
--   DELETE FROM status_checks WHERE checked_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
-- $$);

