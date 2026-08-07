-- Audit log immutability triggers: prevent UPDATE and DELETE on AuditLog rows.
-- Audit records are append-only.

DROP TRIGGER IF EXISTS "AuditLog_no_update";
CREATE TRIGGER "AuditLog_no_update"
BEFORE UPDATE ON "AuditLog"
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'AuditLog rows are immutable: UPDATE is not allowed.');
END;

DROP TRIGGER IF EXISTS "AuditLog_no_delete";
CREATE TRIGGER "AuditLog_no_delete"
BEFORE DELETE ON "AuditLog"
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'AuditLog rows are immutable: DELETE is not allowed.');
END;
