ALTER TABLE video_calls ADD COLUMN accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE video_calls ADD COLUMN ended_at TIMESTAMP WITH TIME ZONE;
-- Existing calls predate chat history; do not generate old events on upgrade.
ALTER TABLE video_calls ADD COLUMN history_recorded BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE messages ADD COLUMN call_id VARCHAR(255);
ALTER TABLE messages ADD COLUMN call_state VARCHAR(32);
ALTER TABLE messages ADD COLUMN call_duration_seconds BIGINT;
CREATE UNIQUE INDEX idx_messages_call_id ON messages(call_id);
