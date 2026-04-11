/**
 * Arrow board catalog for TMP Builder.
 * Each entry corresponds to an SVG in /public/arrows/.
 * No search, no labels in UI — icon-only picker.
 */

export const DEFAULT_ARROW_WIDTH_PX  = 96;
export const DEFAULT_ARROW_HEIGHT_PX = 80;

const ARROW_CATALOG = [
  { id: "arrow_1", src: "/arrows/Arrow_1.svg" },
  { id: "arrow_2", src: "/arrows/Arrow_2.svg" },
  { id: "arrow_3", src: "/arrows/Arrow_3.svg" },
  { id: "arrow_4", src: "/arrows/Arrow_4.svg" },
  { id: "arrow_5", src: "/arrows/Arrow_5.svg" },
  { id: "arrow_6", src: "/arrows/Arrow_6.svg" },
];

export function getArrowCatalog() {
  return ARROW_CATALOG;
}

export function getArrowById(id) {
  return ARROW_CATALOG.find((a) => a.id === id) ?? null;
}

export default getArrowCatalog;
