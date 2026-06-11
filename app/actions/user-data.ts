"use server";

import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";

export type DocRow = { id: string; name: string; html: string };

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user.id;
}

/* ── Documents ─────────────────────────────────────────────────────────── */

export async function listDocuments(): Promise<DocRow[]> {
  const userId = await requireUserId();
  const { rows } = await pool.query<DocRow>(
    `SELECT id, name, html FROM "document" WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return rows;
}

export async function createDocument(name: string, html: string): Promise<DocRow> {
  const userId = await requireUserId();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO "document" (id, user_id, name, html) VALUES ($1, $2, $3, $4)`,
    [id, userId, name || "Untitled", html || "<p></p>"]
  );
  return { id, name: name || "Untitled", html: html || "<p></p>" };
}

export async function updateDocument(id: string, html: string): Promise<void> {
  const userId = await requireUserId();
  await pool.query(
    `UPDATE "document" SET html = $1, updated_at = now() WHERE id = $2 AND user_id = $3`,
    [html, id, userId]
  );
}

export async function renameDocument(id: string, name: string): Promise<void> {
  const userId = await requireUserId();
  await pool.query(
    `UPDATE "document" SET name = $1, updated_at = now() WHERE id = $2 AND user_id = $3`,
    [name, id, userId]
  );
}

export async function deleteDocument(id: string): Promise<void> {
  const userId = await requireUserId();
  await pool.query(`DELETE FROM "document" WHERE id = $1 AND user_id = $2`, [id, userId]);
}

/* ── Preferences (user.metadata jsonb) ─────────────────────────────────── */

export async function getPreferences(): Promise<Record<string, unknown>> {
  const userId = await requireUserId();
  const { rows } = await pool.query<{ metadata: Record<string, unknown> }>(
    `SELECT metadata FROM "user" WHERE id = $1`,
    [userId]
  );
  return rows[0]?.metadata ?? {};
}

export async function savePreferences(metadata: Record<string, unknown>): Promise<void> {
  const userId = await requireUserId();
  await pool.query(`UPDATE "user" SET metadata = $1 WHERE id = $2`, [
    JSON.stringify(metadata),
    userId,
  ]);
}
