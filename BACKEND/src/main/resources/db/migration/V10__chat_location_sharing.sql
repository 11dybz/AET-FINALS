ALTER TABLE messages ADD COLUMN location_lat DOUBLE PRECISION;
ALTER TABLE messages ADD COLUMN location_lon DOUBLE PRECISION;
ALTER TABLE messages ADD COLUMN location_name VARCHAR(100);
ALTER TABLE messages ADD COLUMN location_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE messages ADD COLUMN location_stopped_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX idx_messages_location_thread ON messages(session_id, profile_id, location_expires_at);
