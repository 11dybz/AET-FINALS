ALTER TABLE accounts ADD COLUMN profile_id VARCHAR(255);
ALTER TABLE accounts ADD CONSTRAINT uq_account_profile UNIQUE (profile_id);
ALTER TABLE accounts ADD CONSTRAINT fk_account_profile
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Explicit, trusted assignment requested by the account owner. Public registration cannot claim seeded profiles.
UPDATE accounts SET profile_id = 'chee-reynaldo'
WHERE LOWER(email) = 'reychee06@gmail.com'
  AND EXISTS (SELECT 1 FROM profiles WHERE id = 'chee-reynaldo');
