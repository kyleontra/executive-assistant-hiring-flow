export function googleAccountRole(user, requestedRole) {
  if (!user?.email_confirmed_at || !user.identities?.some(identity => identity.provider === 'google')) {
    throw new Error('Sign in with Google to continue.');
  }
  const existing = user.app_metadata?.account_role;
  if (existing) {
    if (!['candidate', 'employer'].includes(existing)) throw new Error('This account cannot use Google sign-in here.');
    return existing;
  }
  if (!['candidate', 'employer'].includes(requestedRole)) throw new Error('Choose a candidate or employer account.');
  return requestedRole;
}
