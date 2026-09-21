USE pos_db;
ALTER TABLE workflow_requests ADD COLUMN bot_notified_at TIMESTAMP NULL AFTER reviewed_at;
