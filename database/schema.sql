-- =====================================================================
--  CloudSync database schema (PostgreSQL 13+)
--  Run once:  psql "$DATABASE_URL" -f database/schema.sql
--  or:        cd server && npm run db:init
-- =====================================================================

-- gen_random_uuid() is built in from PostgreSQL 13; this line keeps older versions working.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. sync_folders: every local folder a laptop is watching
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_folders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,              -- display name, e.g. "Invoices"
    device_name     VARCHAR(255) NOT NULL,              -- laptop name, e.g. "SAMI-LAPTOP"
    local_path      TEXT         NOT NULL,              -- e.g. "D:\Scans\Invoices"
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE, -- FALSE = removed or paused on the laptop
    file_count      INTEGER      NOT NULL DEFAULT 0,
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_folder_per_device UNIQUE (device_name, local_path)
);

-- ---------------------------------------------------------------------
-- 2. files: one row per file stored in S3 (this is the main table)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id          UUID REFERENCES sync_folders(id) ON DELETE SET NULL,
    file_name          VARCHAR(500) NOT NULL,           -- "report.pdf"
    relative_path      TEXT         NOT NULL,           -- "2026/October/report.pdf" (path inside the synced folder)
    extension          VARCHAR(50),                     -- "pdf"
    mime_type          VARCHAR(255),                    -- "application/pdf"
    category           VARCHAR(20)  NOT NULL DEFAULT 'other',  -- image | video | audio | document | archive | other
    size_bytes         BIGINT       NOT NULL,
    sha256             CHAR(64),                        -- content hash, used to skip duplicate uploads
    s3_bucket          VARCHAR(255) NOT NULL,
    s3_key             TEXT         NOT NULL UNIQUE,    -- "cloudsync/<folder>/<uuid>/2026/October/report.pdf"
    s3_url             TEXT         NOT NULL,           -- https://<bucket>.s3.<region>.amazonaws.com/<key>
    status             VARCHAR(20)  NOT NULL DEFAULT 'uploading', -- uploading | uploaded | failed | deleted
    source             VARCHAR(20)  NOT NULL DEFAULT 'desktop',   -- desktop | mobile
    source_device      VARCHAR(255),
    local_modified_at  TIMESTAMPTZ,                     -- last-modified time of the original local file
    uploaded_at        TIMESTAMPTZ,
    deleted_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_files_status   CHECK (status   IN ('uploading', 'uploaded', 'failed', 'deleted')),
    CONSTRAINT chk_files_category CHECK (category IN ('image', 'video', 'audio', 'document', 'archive', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_files_status_created ON files (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_folder         ON files (folder_id);
CREATE INDEX IF NOT EXISTS idx_files_category       ON files (category);
CREATE INDEX IF NOT EXISTS idx_files_sha256         ON files (sha256);
CREATE INDEX IF NOT EXISTS idx_files_name_lower     ON files (LOWER(file_name));

-- ---------------------------------------------------------------------
-- 3. sync_events: activity log / audit trail (shown in the mobile "Activity" tab)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_events (
    id           BIGSERIAL PRIMARY KEY,
    file_id      UUID REFERENCES files(id)        ON DELETE SET NULL,
    folder_id    UUID REFERENCES sync_folders(id) ON DELETE SET NULL,
    event_type   VARCHAR(30) NOT NULL,   -- uploaded | duplicate_skipped | upload_failed | deleted | folder_added | folder_removed
    message      TEXT,
    device_name  VARCHAR(255),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_created ON sync_events (created_at DESC);
