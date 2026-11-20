-- Explicit assignment requested by the project owner. This grants ownership of
-- Dave's seeded main profile; registration does not grant ownership by email.
-- Transfer only from Dave's previously authorized account, and only when the
-- requested replacement account already exists. Passwords and profiles stay intact.
UPDATE accounts SET profile_id = NULL
WHERE LOWER(email) = 'fontelardave85@gmail.com'
  AND profile_id = 'fontelar-dave'
  AND EXISTS (SELECT 1 FROM accounts target WHERE LOWER(target.email) = 'davefontelar2005@gmail.com')
  AND EXISTS (SELECT 1 FROM profiles WHERE id = 'fontelar-dave');

UPDATE accounts SET profile_id = 'fontelar-dave'
WHERE LOWER(email) = 'davefontelar2005@gmail.com'
  AND EXISTS (SELECT 1 FROM profiles WHERE id = 'fontelar-dave')
  AND NOT EXISTS (
      SELECT 1 FROM accounts owner
      WHERE owner.profile_id = 'fontelar-dave'
        AND LOWER(owner.email) <> 'davefontelar2005@gmail.com'
  );
