/**
 * Optional overrides and manual sign entries.
 * - manualEntries: signs that don’t come from generated files (e.g. legacy or external assets).
 * - overrides: per-id patches applied to generated or manual entries (label, defaultWidth, supportsTripod, etc.).
 *
 * Use overrides to set a friendly label or change behavior for a sign without editing the generated file.
 *
 * Aspect ratio: signCatalog.generated.js entries are typically 64×64 defaults. Intrinsically
 * rectangular assets can set distinct defaultWidth / defaultHeight via overrides, e.g.:
 *   overrides: { "C-020-1LR": { defaultWidth: 96, defaultHeight: 64 } }
 * Editor resize/move uses the same geometry for all signs; non-square behavior comes from wPx≠hPx.
 */

const DEFAULT_WIDTH = 64;
const DEFAULT_HEIGHT = 64;

/** Full entries for signs not in public/signs (e.g. legacy). Included in catalog before generated. */
export const manualEntries = [
  {
    id: "C-018-1A",
    label: "Construction",
    category: "construction",
    src: "/signs/C-018-1A.png",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "C-029",
    label: "Prepare to Stop",
    category: "construction",
    src: "/signs/C-029.png",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "C-001-1",
    label: "Flagger",
    category: "construction",
    src: "/signs/C-001-1.png",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
];

/**
 * Per-id overrides applied to generated or manual entries.
 * Example: { "construction/C-001": { label: "Friendly Name" }, "C-018-1A": { supportsTripod: false } }
 */
export const overrides = {};
