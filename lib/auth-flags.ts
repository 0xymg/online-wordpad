// Server-only. Single source of truth for whether Google sign-in is available:
// the button is shown exactly when Better Auth has the credentials to handle it,
// so there is no separate NEXT_PUBLIC_* flag that can drift out of sync.
// Server components read this and pass it down to the auth form as a prop.
export const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
