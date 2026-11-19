-- Remove invalid self-connections without deleting profiles, accounts or message history.
UPDATE swipes SET action = 'pass', updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.workspace_id = swipes.session_id AND a.profile_id = swipes.profile_id
);

UPDATE video_calls SET state = 'ended'
WHERE state IN ('ringing', 'accepted') AND EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.workspace_id = video_calls.session_id AND a.profile_id = video_calls.profile_id
);

UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
WHERE kind = 'match' AND EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.workspace_id = notifications.session_id AND a.profile_id = notifications.profile_id
);
