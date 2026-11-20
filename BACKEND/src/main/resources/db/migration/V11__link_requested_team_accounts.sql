-- Trusted, explicit account assignments requested by the project owner.
-- Registration must never claim seeded profiles by matching names or emails.
UPDATE accounts SET profile_id = CASE LOWER(email)
    WHEN 'johngregdapog07@gmail.com' THEN 'dapog-john-greg'
    WHEN 'villanuevajustin270@gmail.com' THEN 'villanueva-justin'
    WHEN 'fontelardave85@gmail.com' THEN 'fontelar-dave'
END
WHERE profile_id IS NULL
  AND LOWER(email) IN (
      'johngregdapog07@gmail.com',
      'villanuevajustin270@gmail.com',
      'fontelardave85@gmail.com'
  )
  AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = CASE LOWER(accounts.email)
          WHEN 'johngregdapog07@gmail.com' THEN 'dapog-john-greg'
          WHEN 'villanuevajustin270@gmail.com' THEN 'villanueva-justin'
          WHEN 'fontelardave85@gmail.com' THEN 'fontelar-dave'
      END
      AND NOT EXISTS (SELECT 1 FROM accounts owner WHERE owner.profile_id = p.id)
  );
