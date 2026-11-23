export const ACCOUNT_CONFIRM_MESSAGE =
  "Check your email to confirm the account. After you open the link, your organization is created and you can add equipment.";

export function friendlyAuthError(error: { message: string }): string {
  const message = error.message.toLowerCase();
  if (message.includes("invalid login")) return "That email and password did not match.";
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "That email already has an account. Sign in instead.";
  }
  if (message.includes("password")) return "Use a password of at least 8 characters.";
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Too many email attempts. Wait a minute and try again.";
  }
  if (message.includes("email not confirmed")) return "Confirm the email address first, then sign in.";
  return "Sign-in did not complete. Check the email and password, then try again.";
}
