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
    id: "R-056-1",
    label: "R-056-1",
    category: "general",
    src: "/signs/R-056-1.svg",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "R-082-L",
    label: "R-082-L",
    category: "general",
    src: "/signs/R-082-L.svg",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "R-082-R1",
    label: "R-082-R1",
    category: "general",
    src: "/signs/R-082-R1.svg",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "R-082-R2u",
    label: "R-082-R2u",
    category: "general",
    src: "/signs/R-082-R2u.svg",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "R-083-L",
    label: "R-083-L",
    category: "general",
    src: "/signs/R-083-L.svg",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "R-083-R",
    label: "R-083-R",
    category: "general",
    src: "/signs/R-083-R.svg",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "B-R-101-1",
    label: "B-R-101-1",
    category: "general",
    src: "/signs/B-R-101-1.svg",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "B-R-101-2",
    label: "B-R-101-2",
    category: "general",
    src: "/signs/B-R-101-2.svg",
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "B-R-101-Tb",
    label: "B-R-101-Tb",
    category: "general",
    src: "/signs/B-R-101-Tb.svg",
    defaultWidth: 96,
    defaultHeight: 44,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
  {
    id: "B-R-101-Tc",
    label: "B-R-101-Tc",
    category: "general",
    src: "/signs/B-R-101-Tc.svg",
    defaultWidth: 96,
    defaultHeight: 48,
    supportsTripod: true,
    supportsWindmaster: true,
    supportsRotation: true,
  },
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
