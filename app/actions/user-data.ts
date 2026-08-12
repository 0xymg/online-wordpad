"use server";

import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";

export type DocRow = { id: string; name: string; html: string; folder?: string | null };

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user.id;
}

/* ── Lazy migrations (run once per server process) ─────────────────────── */

let versionsTableReady: Promise<unknown> | null = null;
function ensureVersionsTable() {
  if (!versionsTableReady) {
    versionsTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS "document_version" (
        id text PRIMARY KEY,
        document_id text NOT NULL,
        user_id text NOT NULL,
        html text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
  return versionsTableReady;
}

let folderColumnReady: Promise<unknown> | null = null;
function ensureFolderColumn() {
  if (!folderColumnReady) {
    folderColumnReady = pool.query(
      `ALTER TABLE "document" ADD COLUMN IF NOT EXISTS folder text`
    );
  }
  return folderColumnReady;
}

/* ── Documents ─────────────────────────────────────────────────────────── */

export async function listDocuments(): Promise<DocRow[]> {
  const userId = await requireUserId();
  await ensureFolderColumn();
  const { rows } = await pool.query<DocRow>(
    `SELECT id, name, html, folder FROM "document" WHERE user_id = $1 ORDER BY updated_at DESC`,
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
  return { id, name: name || "Untitled", html: html || "<p></p>", folder: null };
}

export async function setDocumentFolder(id: string, folder: string | null): Promise<void> {
  const userId = await requireUserId();
  await ensureFolderColumn();
  await pool.query(
    `UPDATE "document" SET folder = $1, updated_at = now() WHERE id = $2 AND user_id = $3`,
    [folder, id, userId]
  );
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
  await ensureVersionsTable();
  await pool.query(`DELETE FROM "document_version" WHERE document_id = $1 AND user_id = $2`, [id, userId]);
}

/* ── Version history ───────────────────────────────────────────────────── */

export type VersionRow = { id: string; createdAt: string };

const MAX_VERSIONS_PER_DOC = 10;

export async function saveVersion(documentId: string, html: string): Promise<void> {
  const userId = await requireUserId();
  await ensureVersionsTable();
  await pool.query(
    `INSERT INTO "document_version" (id, document_id, user_id, html) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), documentId, userId, html]
  );
  await pool.query(
    `DELETE FROM "document_version"
     WHERE document_id = $1 AND user_id = $2 AND id NOT IN (
       SELECT id FROM "document_version"
       WHERE document_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT ${MAX_VERSIONS_PER_DOC}
     )`,
    [documentId, userId]
  );
}

export async function listVersions(documentId: string): Promise<VersionRow[]> {
  const userId = await requireUserId();
  await ensureVersionsTable();
  const { rows } = await pool.query<{ id: string; created_at: Date }>(
    `SELECT id, created_at FROM "document_version"
     WHERE document_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
    [documentId, userId]
  );
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at.toISOString() }));
}

export async function getVersionHtml(versionId: string): Promise<string | null> {
  const userId = await requireUserId();
  await ensureVersionsTable();
  const { rows } = await pool.query<{ html: string }>(
    `SELECT html FROM "document_version" WHERE id = $1 AND user_id = $2`,
    [versionId, userId]
  );
  return rows[0]?.html ?? null;
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

// Merges into the existing metadata rather than replacing it, so a partial
// save can never drop keys written by another part of the app.
export async function savePreferences(metadata: Record<string, unknown>): Promise<void> {
  const userId = await requireUserId();
  await pool.query(
    `UPDATE "user" SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
    [JSON.stringify(metadata), userId]
  );
}
