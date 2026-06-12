import { betterAuth } from "better-auth";
import { pool } from "./db";

const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const trustedOrigins = [
  "https://wordpad.info",
  "https://www.wordpad.info",
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000", "http://localhost:3001"] : []),
];

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins,
  database: pool,
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
  socialProviders: hasGoogle
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : {},
});
