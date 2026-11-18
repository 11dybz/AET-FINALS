CREATE TABLE accounts (
    id VARCHAR(255) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    workspace_id VARCHAR(255) NOT NULL UNIQUE REFERENCES visitor_sessions(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE TABLE account_sessions (
    id VARCHAR(64) PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_account_session_expiry ON account_sessions(expires_at);
CREATE INDEX idx_account_sessions_account ON account_sessions(account_id);
