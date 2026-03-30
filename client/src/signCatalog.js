/**
 * Centralized sign catalog for TMP Builder.
 * Entries come from:
 * 1. signCatalog.generated.js — auto-generated from public/signs/ (run: npm run generate:signs)
 * 2. signCatalog.overrides.js — manual entries (e.g. legacy) + per-id overrides
 *
 * All signs get the same behavior: insert, select, drag, rotate, blue boundary,
 * tripod/windmaster support (when enabled), save/load, export/PDF.
 *
 * To add signs in bulk: put SVG or PNG files in public/signs/ or public/signs/<category>/
 * then run: npm run generate:signs
 */

import { SIGN_CATALOG_GENERATED } from "./signCatalog.generated.js";
import { manualEntries, overrides } from "./signCatalog.overrides.js";

const DEFAULT_SIGN_WIDTH_PX = 64;
const DEFAULT_SIGN_HEIGHT_PX = 64;

function mergeCatalog() {
  const byId = new Map();
  for (const e of manualEntries) {
    byId.set(e.id, { ...e });
  }
  for (const e of SIGN_CATALOG_GENERATED) {
    if (!byId.has(e.id)) byId.set(e.id, { ...e });
  }
  for (const [id, patch] of Object.entries(overrides)) {
    const entry = byId.get(id);
    if (entry) Object.assign(entry, patch);
  }
  const list = Array.from(byId.values());
  list.sort((a, b) => {
    const c = (a.category || "").localeCompare(b.category || "");
    return c !== 0 ? c : (a.id || "").localeCompare(b.id || "");
  });
  return list;
}

const SIGN_CATALOG = mergeCatalog();

/**
 * Normalize catalog entry for backward compatibility with existing UI (code, name, src).
 */
function toLegacyItem(entry) {
  return {
    code: entry.id,
    name: entry.label,
    src: entry.src,
    ...entry,
  };
}

/**
 * Full sign catalog as array (legacy-compatible shape for panel list and selection).
 */
export function getSignCatalog() {
  return SIGN_CATALOG.map(toLegacyItem);
}

/**
 * Get a single sign by id/code.
 */
export function getSignById(idOrCode) {
  const entry = SIGN_CATALOG.find((e) => e.id === idOrCode);
  return entry ? toLegacyItem(entry) : null;
}

export { DEFAULT_SIGN_WIDTH_PX, DEFAULT_SIGN_HEIGHT_PX };

export default getSignCatalog;
