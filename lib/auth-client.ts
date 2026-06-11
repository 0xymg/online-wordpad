"use client";

import { createAuthClient } from "better-auth/react";

// No baseURL → the client uses the current window origin (works on any port/host).
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
