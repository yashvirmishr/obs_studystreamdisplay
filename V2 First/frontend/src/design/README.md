# Study Stream 2.0 — Design System (Phase 2 foundation)

An isolated, dependency-free design module living in `frontend/src/design/`.
No animation libraries, no UI kits (no MUI/Mantine). CSS custom properties +
hand-rolled React primitives.

## Token philosophy

- **Dark-first.** The app is a desktop study-stream tool used in the dark;
  every token is tuned for a graphite/charcoal dark canvas. If a light theme
  is ever added, it will be a second `:root[data-theme="light"]` override
  block in `tokens.css`, not per-component colors.
- **Material 3-inspired, not Material-stamped.** We borrow the M3 role model
  (surface / on-surface / primary / outline roles, tonal surfaces, standard
  easing) but define our own palette: deep green (`primary.deep`) as the
  action color, muted sage (`primary.sage`) as the supporting tint, and
  teal / blue / lavender as accents reserved for data viz, focus rings and
  widget identity — never for primary actions.
- **Single source of truth.** `tokens.ts` (strongly typed, `as const`) is
  authoritative. `tokens.css` mirrors it as `--ss-*` custom properties and
  must be kept in sync — a comment at the top of `tokens.css` points back at
  `tokens.ts`. TS gives Phase 4 widgets compile-checked token access; CSS
  vars give stylesheets runtime access without CSS-in-JS.
- **Motion restraint.** One standard easing
  (`cubic-bezier(0.2, 0, 0, 1)`) and three durations (120 / 160 / 200 ms).
  Transitions are limited to color/shadow/border changes; no layout
  animations, no animation libraries.

## Layout of the module

```
design/
  tokens.ts          # source of truth (typed token object)
  tokens.css         # --ss-* custom properties (mirror of tokens.ts)
  primitives/
    primitives.css   # all primitive styles, tokens-only
    Button.tsx       # filled|tonal|outlined|text|destructive, sm|md|lg, loading, icon
    Card.tsx         # base|tonal|elevated tones, optional header/footer
    StatusPill.tsx   # online|offline|degraded|warning with dot
    SectionHeader.tsx# title + subtitle + optional action
    index.ts         # barrel export
  preview/
    DesignPreview.tsx# self-contained visual acceptance page (all states)
```

## How widgets consume tokens (Phase 4)

1. Widgets are built from the primitives in `design/primitives/` — do not
   re-implement buttons, cards, pills or headers at the widget layer.
2. All colors, radii, spacing, typography and motion values come from the
   `--ss-*` custom properties (CSS) or the typed `tokens` object (TS).
   Widgets never hardcode hex values.
3. **Widget-specific colors never override global tokens.** A widget may
   *choose* among tokens (e.g. the timer widget using `accent.teal` as its
   identity color via an explicit config value), but it may not redefine
   `--ss-*` variables or introduce off-palette colors. If a widget needs a
   value that doesn't exist, the token gets added to `tokens.ts` +
   `tokens.css` first — reviewed as a design-system change, then consumed.
   The only sanctioned per-widget variation is an explicit `config` mapping
   widget identity → an existing accent token.
4. Widget CSS is scoped to the widget's own class namespace and may compose
   primitives; it must not restyle `.ss-*` classes.

## Previewing the system

`design/preview/DesignPreview.tsx` renders every primitive in every state
(variants × sizes × loading/disabled, all card tones, all pill statuses, all
token swatches). It is intentionally not wired into `App.tsx`. To review it:

```tsx
// temporarily in App.tsx (or any route):
import { DesignPreview } from "./design/preview/DesignPreview";
// render <DesignPreview /> and open the dev server
```

## Rules enforced by review

- New files under `design/` may import `react` and each other — nothing else.
- `tokens.ts` and `tokens.css` must contain identical values (swatches on the
  preview page are rendered from `tokens.ts` to make drift visible).
- No `any`, no `as unknown as X` casts, no `// @ts-ignore` — strict mode stays
  on and clean.
