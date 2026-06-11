import { betterAuth } from "better-auth";
import { pool } from "./db";

const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    // Do not block login on unverified email — we only warn the user.
    requireEmailVerification: false,
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
