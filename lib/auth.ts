import { betterAuth } from "better-auth";
import { pool } from "./db";
import { googleEnabled } from "./auth-flags";

const trustedOrigins = [
  "https://wordpad.info",
  "https://www.wordpad.info",
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000", "http://localhost:3001"] : []),
];

// Sessions are signed with this. Without it Better Auth falls back to a
// built-in default, and every deploy (or serverless instance) can invalidate
// existing cookies — which shows up as users being asked to sign in again.
// Set BETTER_AUTH_SECRET in the environment; generate one with:
//   openssl rand -base64 32
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret && process.env.NODE_ENV === "production") {
  console.error(
    "[EDTRpad] BETTER_AUTH_SECRET is not set. Sessions will not survive deploys — set it in your environment."
  );
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret,
  trustedOrigins,
  database: pool,
  session: {
    expiresIn: 60 * 60 * 24 * 30,   // 30 gün
    updateAge: 60 * 60 * 24,         // her 24 saatte cookie yenile
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  advanced: {
    // Persistent (not session-scoped) cookies so closing the browser doesn't
    // sign the user out; lax keeps them attached on normal navigations.
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      if (process.env.RESEND_API_KEY) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM || "EDTRpad <onboarding@resend.dev>",
              to: user.email,
              subject: "Reset your EDTRpad password",
              html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${url}">Reset password</a></p><p>If you didn't request this, you can ignore this email.</p>`,
            }),
          });
        } catch (e) {
          console.error("[EDTRpad] reset password email failed:", e);
        }
      } else {
        console.log(`[EDTRpad] Password reset link for ${user.email}: ${url}`);
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (process.env.RESEND_API_KEY) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM || "EDTRpad <onboarding@resend.dev>",
              to: user.email,
              subject: "Verify your EDTRpad email",
              html: `<p>Welcome to EDTRpad! Please verify your email by clicking the link below:</p><p><a href="${url}">Verify email</a></p>`,
            }),
          });
        } catch (e) {
          console.error("[EDTRpad] verification email failed:", e);
        }
      } else {
        // No email provider configured — log the link so verification still works in dev.
        console.log(`[EDTRpad] Verification link for ${user.email}: ${url}`);
      }
    },
  },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : {},
});
