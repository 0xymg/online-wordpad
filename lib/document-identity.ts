/** Pure identity planning for future document-model migrations and clipboard imports.
 * No editor/schema/storage integration occurs here. Callers supply UUID entropy.
 */
export const IDENTITY_PREFIXES = {
  document: "doc", section: "sec", target: "tgt", note: "nte",
  source: "src", field: "fld", object: "obj",
} as const;
export type DocumentIdentityKind = keyof typeof IDENTITY_PREFIXES;
export type DocumentIdentity<K extends DocumentIdentityKind = DocumentIdentityKind> = string & { readonly __documentIdentity: K };
export type IdentityTokenFactory = () => string;
const prefixKinds = new Map<string, DocumentIdentityKind>(Object.entries(IDENTITY_PREFIXES).map(([kind, prefix]) => [prefix, kind as DocumentIdentityKind]));
const pattern = /^(doc|sec|tgt|nte|src|fld|obj)_([0-9a-f]{32})$/;

export function identityKind(value: unknown): DocumentIdentityKind | null {
  if (typeof value !== "string") return null;
  const match = pattern.exec(value);
  return match ? prefixKinds.get(match[1]) || null : null;
}
export function isDocumentIdentity<K extends DocumentIdentityKind>(value: unknown, kind: K): value is DocumentIdentity<K> {
  return identityKind(value) === kind;
}

/** Never fall back to timestamps or Math.random: exhaustion/invalid entropy is explicit. */
export function allocateDocumentIdentity<K extends DocumentIdentityKind>(kind: K, occupied: ReadonlySet<string>, createToken: IdentityTokenFactory): DocumentIdentity<K> {
  if (!Object.hasOwn(IDENTITY_PREFIXES, kind)) throw new Error("Unknown document identity kind");
  const prefix = IDENTITY_PREFIXES[kind];
  for (let attempt = 0; attempt < 32; attempt++) {
    const token = createToken();
    if (typeof token !== "string" || !/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(token))
      throw new Error("Document identity entropy must be a UUID or 32 hexadecimal characters");
    const id = `${prefix}_${token.replace(/-/g, "").toLowerCase()}` as DocumentIdentity<K>;
    if (!occupied.has(id)) return id;
  }
  throw new Error("Could not allocate a unique document identity");
}

/** key identifies a definition occurrence within this batch, never a saved identity. */
export type IdentityDefinition = { readonly key: string; readonly kind: DocumentIdentityKind; readonly id?: unknown };
export type IdentityAssignment = {
  key: string; kind: DocumentIdentityKind; oldId: DocumentIdentity | null; id: DocumentIdentity;
  reason: "preserved" | "missing" | "invalid" | "duplicate" | "collision" | "cloned";
};
export type IdentityPlan = {
  assignments: readonly IdentityAssignment[];
  /** Only unambiguous IDs occur here. Duplicate source IDs must never choose a winner. */
  remap: ReadonlyMap<DocumentIdentity, DocumentIdentity>;
  ambiguous: ReadonlySet<DocumentIdentity>;
};

/** Preserve on load/move; clone on copy/paste. The caller applies one atomic edit. */
export function planDocumentIdentities(definitions: readonly IdentityDefinition[], options: {
  mode: "preserve" | "clone"; occupied?: ReadonlySet<string>; createToken: IdentityTokenFactory;
}): IdentityPlan {
  if (options.mode !== "preserve" && options.mode !== "clone") throw new Error("Unknown document identity planning mode");
  const keys = new Set<string>(), counts = new Map<DocumentIdentity, number>();
  for (const definition of definitions) {
    if (!definition.key || keys.has(definition.key)) throw new Error("Identity definition keys must be unique and nonempty");
    keys.add(definition.key);
    if (!Object.hasOwn(IDENTITY_PREFIXES, definition.kind)) throw new Error("Unknown document identity kind");
    if (isDocumentIdentity(definition.id, definition.kind)) counts.set(definition.id, (counts.get(definition.id) || 0) + 1);
  }
  const existing = options.occupied || new Set<string>();
  // Reserve all incoming valid IDs up front: a fresh allocation cannot steal
  // the ID of a later definition, including in a clone operation.
  const reserved = new Set<string>([...existing, ...counts.keys()]);
  const claimed = new Set<string>(existing), remap = new Map<DocumentIdentity, DocumentIdentity>();
  const ambiguous = new Set(Array.from(counts).filter(([, count]) => count > 1).map(([id]) => id));
  const assignments = definitions.map(definition => {
    const oldId = isDocumentIdentity(definition.id, definition.kind) ? definition.id : null;
    let reason: IdentityAssignment["reason"];
    if (!oldId) reason = definition.id == null || definition.id === "" ? "missing" : "invalid";
    else if (options.mode === "clone") reason = "cloned";
    else if (claimed.has(oldId)) reason = existing.has(oldId) ? "collision" : "duplicate";
    else reason = "preserved";
    const id = reason === "preserved" ? oldId! : allocateDocumentIdentity(definition.kind, reserved, options.createToken);
    reserved.add(id); claimed.add(id);
    if (oldId && !ambiguous.has(oldId)) remap.set(oldId, id);
    return { key: definition.key, kind: definition.kind, oldId, id, reason };
  });
  return { assignments, remap, ambiguous };
}

export type IdentityReferenceResult =
  | { status: "mapped" | "existing"; id: DocumentIdentity }
  | { status: "ambiguous" | "invalid" | "unresolved"; id: null };

/** Existing targets are permitted only when the caller verified same-document
 * provenance. Cross-document paste must omit existingTargets.
 */
export function resolveIdentityReference(value: unknown, kind: DocumentIdentityKind, plan: IdentityPlan,
  existingTargets: ReadonlySet<string> = new Set()): IdentityReferenceResult {
  if (!isDocumentIdentity(value, kind)) return { status: "invalid", id: null };
  if (plan.ambiguous.has(value)) return { status: "ambiguous", id: null };
  const mapped = plan.remap.get(value);
  if (mapped) return { status: "mapped", id: mapped };
  if (existingTargets.has(value)) return { status: "existing", id: value };
  return { status: "unresolved", id: null };
}
