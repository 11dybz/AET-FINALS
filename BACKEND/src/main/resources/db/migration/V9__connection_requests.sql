CREATE TABLE connections (
    id VARCHAR(255) PRIMARY KEY,
    low_profile_id VARCHAR(255) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    high_profile_id VARCHAR(255) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    requester_profile_id VARCHAR(255) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_profile_id VARCHAR(255) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    thread_session_id VARCHAR(255) NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
    thread_profile_id VARCHAR(255) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled','removed')),
    priority BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (low_profile_id, high_profile_id),
    CHECK (low_profile_id < high_profile_id),
    CHECK ((requester_profile_id = low_profile_id AND recipient_profile_id = high_profile_id)
        OR (requester_profile_id = high_profile_id AND recipient_profile_id = low_profile_id)),
    CHECK (thread_profile_id IN (low_profile_id, high_profile_id))
);
CREATE INDEX idx_connections_requester ON connections(requester_profile_id, status);
CREATE INDEX idx_connections_recipient ON connections(recipient_profile_id, status);
CREATE UNIQUE INDEX idx_connections_thread ON connections(thread_session_id, thread_profile_id);

-- A saved card was unilateral. Preserve its thread, but require the recipient's consent.
-- Choose one stable thread when both people previously saved each other's profile.
INSERT INTO connections (id, low_profile_id, high_profile_id, requester_profile_id, recipient_profile_id,
    thread_session_id, thread_profile_id, status, priority, created_at, updated_at)
SELECT 'legacy-' || CAST(id AS VARCHAR), low_id, high_id, own_id, target_id,
    workspace_id, target_id, 'pending', action = 'super_like', created_at, updated_at
FROM (
    SELECT s.id, a.profile_id AS own_id, s.profile_id AS target_id, a.workspace_id, s.action, s.created_at, s.updated_at,
        CASE WHEN a.profile_id < s.profile_id THEN a.profile_id ELSE s.profile_id END AS low_id,
        CASE WHEN a.profile_id < s.profile_id THEN s.profile_id ELSE a.profile_id END AS high_id,
        ROW_NUMBER() OVER (PARTITION BY
            CASE WHEN a.profile_id < s.profile_id THEN a.profile_id ELSE s.profile_id END,
            CASE WHEN a.profile_id < s.profile_id THEN s.profile_id ELSE a.profile_id END
            ORDER BY s.created_at, s.id) AS pair_rank
    FROM swipes s JOIN accounts a ON a.workspace_id = s.session_id
    WHERE a.profile_id IS NOT NULL AND a.profile_id <> s.profile_id AND s.action IN ('like','super_like')
) saved WHERE pair_rank = 1;

-- Fold the reverse legacy conversation into the stable thread, retaining message ids,
-- timestamps and read receipts. Reverse the sender side to preserve who said what.
CREATE TABLE connection_thread_merges AS
SELECT reverse_owner.workspace_id AS old_session, anchor.profile_id AS old_profile,
    c.thread_session_id AS new_session, c.thread_profile_id AS new_profile
FROM connections c
JOIN accounts anchor ON anchor.workspace_id = c.thread_session_id
JOIN accounts reverse_owner ON reverse_owner.profile_id = c.thread_profile_id;

UPDATE messages m SET
    session_id = (SELECT x.new_session FROM connection_thread_merges x WHERE x.old_session = m.session_id AND x.old_profile = m.profile_id),
    profile_id = (SELECT x.new_profile FROM connection_thread_merges x WHERE x.old_session = m.session_id AND x.old_profile = m.profile_id),
    sender = CASE WHEN sender = 'visitor' THEN 'member' ELSE 'visitor' END
WHERE EXISTS (SELECT 1 FROM connection_thread_merges x WHERE x.old_session = m.session_id AND x.old_profile = m.profile_id);
DROP TABLE connection_thread_merges;

UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE kind = 'match' AND read_at IS NULL;
INSERT INTO notifications (session_id, profile_id, kind, body, created_at)
SELECT recipient.workspace_id, c.requester_profile_id, 'request',
    requester.name || ' sent you a connection request. Review it in Connections.', CURRENT_TIMESTAMP
FROM connections c JOIN accounts recipient ON recipient.profile_id = c.recipient_profile_id
JOIN profiles requester ON requester.id = c.requester_profile_id;

-- A pre-existing call does not imply consent to the new connection flow.
UPDATE video_calls SET state = 'ended' WHERE state IN ('ringing','accepted');
