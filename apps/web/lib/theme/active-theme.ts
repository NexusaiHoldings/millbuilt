/**
 * active-theme — the resolved ThemeContract this company wears.
 * Written by provisioning (_step_substrate_install): an approved mood
 * board's derived theme wins, else the CMO's authored ThemeContract
 * (company-theme-authoring-001 / visual phase 3b). Do NOT hand-edit.
 */
import type { ThemeContract } from "./contract";

export const activeTheme: ThemeContract = {
  "type": {
    "fontBody": "system-sans",
    "fontHeading": "inter"
  },
  "color": {
    "bg": "#ffffff",
    "text": "#1a2332",
    "accent": "#1e4a7a",
    "border": "#d6dce4",
    "danger": "#b91c1c",
    "success": "#15803d",
    "surface": "#f4f6f8",
    "textMuted": "#4a5568",
    "accentText": "#ffffff",
    "surfaceAlt": "#e8ecf0",
    "borderStrong": "#b0bac8"
  },
  "shape": {
    "radius": 6
  }
};
