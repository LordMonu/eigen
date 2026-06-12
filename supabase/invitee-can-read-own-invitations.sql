-- Allow an invitee (auth.users row matching the invitation email) to
-- SELECT their own pending invitations during onboarding, BEFORE they
-- belong to any organization. The "Org masters can manage invitations"
-- policy still gates everything else.
--
-- Email comparison uses LOWER() because the invite UI stores the email
-- as trimmed().toLowerCase() but auth.users.email casing isn't
-- guaranteed across all providers.

DROP POLICY IF EXISTS "Invitees can read own invitations" ON invitations;
CREATE POLICY "Invitees can read own invitations" ON invitations
  FOR SELECT TO authenticated
  USING (
    LOWER(email) =
    LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
  );
