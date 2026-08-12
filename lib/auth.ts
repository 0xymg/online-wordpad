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

// The site answers on both wordpad.info and www.wordpad.info, and Vercel's
// primary-domain redirect can move a request from one host to the other in the
// middle of an OAuth round trip. With host-only cookies that breaks sign-in:
// the state cookie is written on the host the user started from and read back
// on the other one, which fails as `state_mismatch` and leaves no session.
// A leading-dot domain lets both hosts share the auth cookies.
// Only for the real domain — on localhost and preview deployments (*.vercel.app)
// a wordpad.info domain would be rejected outright, so cookies stay host-only.
const authHost = (() => {
  try { return new URL(process.env.BETTER_AUTH_URL ?? "").hostname; } catch { return ""; }
})();
const cookieDomain = /(^|\.)wordpad\.info$/.test(authHost) ? ".wordpad.info" : undefined;

// One place for the outgoing mail: without a provider key the link is logged
// instead, so verification and password reset still work in development.
async function sendMail({ to, subject, html, devLabel }: {
  to: string; subject: string; html: string; devLabel: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EDTRpad] ${devLabel}: ${html.match(/href="([^"]+)"/)?.[1] ?? ""}`);
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "EDTRpad <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });
  } catch (e) {
    console.error(`[EDTRpad] ${devLabel} failed:`, e);
  }
}

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
    ...(cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } } : {}),
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
      await sendMail({
        to: user.email,
        subject: "Reset your EDTRpad password",
        html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${url}">Reset password</a></p><p>If you didn't request this, you can ignore this email.</p>`,
        devLabel: `Password reset link for ${user.email}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Verify your EDTRpad email",
        html: `<p>Welcome to EDTRpad! Please verify your email by clicking the link below:</p><p><a href="${url}">Verify email</a></p>`,
        devLabel: `Verification link for ${user.email}`,
      });
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      // Without this, signing in with Google fails as `account_not_linked`
      // whenever the address already has a password account that has not been
      // verified — and local accounts stay unverified whenever no mail provider
      // is configured, so it would block the flow for practically everyone.
      // Google has itself verified the address before we get here.
      // The trade-off: someone who registered a password account under an
      // address they do not own would be merged into the real owner's Google
      // sign-in. Requiring verified local emails (i.e. configuring RESEND_API_KEY
      // and setting this back to true) is the stricter option.
      requireLocalEmailVerified: false,
    },
  },
  user: {
    changeEmail: {
      enabled: true,
      // A verified address only moves once the new one is confirmed, so the
      // link goes to the new address and the old one keeps working until then.
      sendChangeEmailVerification: async ({ newEmail, url }: { newEmail: string; url: string }) => {
        await sendMail({
          to: newEmail,
          subject: "Confirm your new EDTRpad email",
          html: `<p>Confirm this address to finish changing the email on your EDTRpad account:</p><p><a href="${url}">Confirm email change</a></p><p>If you didn't request this, you can ignore this email.</p>`,
          devLabel: `Email change link for ${newEmail}`,
        });
      },
    },
    deleteUser: {
      enabled: true,
      // Better Auth removes the account rows; the documents are ours to clear,
      // and they must go before the user row so nothing is left orphaned.
      beforeDelete: async (user) => {
        await pool.query(`DELETE FROM "document_version" WHERE user_id = $1`, [user.id]);
        await pool.query(`DELETE FROM "document" WHERE user_id = $1`, [user.id]);
      },
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
