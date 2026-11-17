import { useState } from "react";
import { tokens } from "../tokens";
import { Button, Card, StatusPill, SectionHeader } from "../primitives";
import type { ButtonSize, ButtonVariant, StatusKind, CardTone } from "../primitives";
import "../tokens.css";
import "../primitives/primitives.css";

/**
 * DesignPreview — self-contained visual acceptance page for the design-system
 * foundation. Renders every primitive in every defined state on a dark canvas.
 *
 * Not wired into the app; temporarily render it from App.tsx or main.tsx to
 * review it in a browser:
 *   import { DesignPreview } from "./design/preview/DesignPreview";
 */

const buttonVariants: readonly ButtonVariant[] = [
  "filled",
  "tonal",
  "outlined",
  "text",
  "destructive",
];

const buttonSizes: readonly ButtonSize[] = ["sm", "md", "lg"];

const statusKinds: readonly StatusKind[] = [
  "online",
  "offline",
  "degraded",
  "warning",
];

const cardTones: readonly CardTone[] = ["base", "tonal", "elevated"];

const swatchGroups = [
  "surface",
  "text",
  "primary",
  "accent",
  "status",
  "semantic",
] as const;

type SwatchGroup = (typeof swatchGroups)[number];

function swatchEntries(group: SwatchGroup): Array<[string, string]> {
  const groupTokens = tokens.colors[group];
  return Object.entries(groupTokens);
}

function PreviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="ss-preview-row">
      <span className="ss-preview-row__label">{label}</span>
      <div className="ss-preview-row__content">{children}</div>
    </div>
  );
}

export function DesignPreview(): JSX.Element {
  const [demoLoading, setDemoLoading] = useState(false);

  return (
    <div className="ss-preview">
      <header className="ss-preview__intro">
        <h1 className="ss-preview__title">Design system foundation</h1>
        <p className="ss-preview__subtitle">
          Dark-first, Material 3-inspired tokens and primitives. Every primitive
          in every state — this page is the module&rsquo;s visual acceptance test.
        </p>
      </header>

      {/* ------------------------------- Buttons ------------------------- */}
      <section className="ss-preview__section">
        <SectionHeader
          title="Button"
          subtitle="filled / tonal / outlined / text / destructive, three sizes"
        />
        {buttonVariants.map((variant) => (
          <PreviewRow key={variant} label={variant}>
            {buttonSizes.map((size) => (
              <Button key={`${variant}-${size}`} variant={variant} size={size}>
                {variant} {size}
              </Button>
            ))}
          </PreviewRow>
        ))}
        <PreviewRow label="with icon">
          <Button variant="tonal" size="md" icon={<span>+</span>}>
            Add widget
          </Button>
        </PreviewRow>
        <PreviewRow label="loading">
          <Button
            variant="filled"
            size="md"
            loading={demoLoading}
            onClick={() => setDemoLoading(true)}
          >
            {demoLoading ? "Connecting…" : "Trigger loading"}
          </Button>
          <Button
            variant="outlined"
            size="md"
            loading
            onClick={() => setDemoLoading(false)}
          >
            Static spinner
          </Button>
          <Button
            variant="text"
            size="md"
            onClick={() => setDemoLoading(false)}
            disabled={!demoLoading}
          >
            Reset
          </Button>
        </PreviewRow>
        <PreviewRow label="disabled">
          <Button variant="filled" size="md" disabled>
            Disabled filled
          </Button>
          <Button variant="destructive" size="md" disabled>
            Disabled destructive
          </Button>
        </PreviewRow>
      </section>

      {/* -------------------------------- Cards -------------------------- */}
      <section className="ss-preview__section">
        <SectionHeader
          title="Card"
          subtitle="base / tonal / elevated surfaces, optional header and footer"
        />
        <div className="ss-preview-grid">
          {cardTones.map((tone) => (
            <Card
              key={tone}
              tone={tone}
              header={
                <SectionHeader title={`${tone} card`} subtitle="with header" />
              }
              footer={
                <Button variant="text" size="sm">
                  Footer action
                </Button>
              }
            >
              <p className="ss-preview-copy">
                Card body copy on the <strong>{tone}</strong> surface tone. Body
                padding, hairline dividers and radii all come from tokens.
              </p>
            </Card>
          ))}
          <Card tone="base">
            <p className="ss-preview-copy">
              Minimal card: no header, no footer — body only.
            </p>
          </Card>
        </div>
      </section>

      {/* ----------------------------- StatusPill ------------------------ */}
      <section className="ss-preview__section">
        <SectionHeader
          title="StatusPill"
          subtitle="online / offline / degraded / warning, two sizes, custom labels"
        />
        {statusKinds.map((status) => (
          <PreviewRow key={status} label={status}>
            <StatusPill status={status} size="md" />
            <StatusPill status={status} size="sm" />
            <StatusPill status={status} label={`Backend ${status}`} size="md" />
          </PreviewRow>
        ))}
      </section>

      {/* ---------------------------- SectionHeader ---------------------- */}
      <section className="ss-preview__section">
        <SectionHeader
          title="SectionHeader"
          subtitle="title + subtitle, optional action slot"
        />
        <div className="ss-preview-stack">
          <SectionHeader title="Only a title" />
          <SectionHeader title="Title" subtitle="With a muted subtitle" />
          <SectionHeader
            title="Title with action"
            subtitle="The action slot aligns with the title line"
            action={
              <Button variant="outlined" size="sm">
                Configure
              </Button>
            }
          />
        </div>
      </section>

      {/* ------------------------------ Tokens --------------------------- */}
      <section className="ss-preview__section">
        <SectionHeader
          title="Tokens"
          subtitle="rendered straight from tokens.ts — the CSS mirrors these values"
        />
        {swatchGroups.map((group) => (
          <PreviewRow key={group} label={group}>
            <div className="ss-preview-swatches">
              {swatchEntries(group).map(([name, value]) => (
                <div key={name} className="ss-preview-swatch" title={value}>
                  <span
                    className="ss-preview-swatch__chip"
                    style={{ background: value }}
                  />
                  <span className="ss-preview-swatch__name">{name}</span>
                </div>
              ))}
            </div>
          </PreviewRow>
        ))}
      </section>
    </div>
  );
}

export default DesignPreview;

/* Inline styles are limited to the preview page itself (layout chrome) —
   component styling lives exclusively in primitives.css + tokens.css. */
const previewStyles = `
.ss-preview {
  min-height: 100vh;
  background: var(--ss-color-surface-background);
  color: var(--ss-color-text-primary);
  font-family: var(--ss-font-family);
  max-width: 960px;
  margin: 0 auto;
  padding: var(--ss-space-10) var(--ss-space-6);
}
.ss-preview__intro { margin-bottom: var(--ss-space-8); }
.ss-preview__title {
  margin: 0;
  font-size: var(--ss-font-size-xxl);
  font-weight: var(--ss-font-weight-semibold);
  letter-spacing: -0.02em;
}
.ss-preview__subtitle {
  margin: var(--ss-space-2) 0 0;
  color: var(--ss-color-text-muted);
  font-size: var(--ss-font-size-md);
}
.ss-preview__section {
  margin-top: var(--ss-space-10);
  display: grid;
  gap: var(--ss-space-5);
}
.ss-preview-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  align-items: center;
  gap: var(--ss-space-4);
}
.ss-preview-row__label {
  font-size: var(--ss-font-size-sm);
  color: var(--ss-color-text-faint);
  font-family: var(--ss-font-family-mono);
}
.ss-preview-row__content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ss-space-3);
}
.ss-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--ss-space-4);
}
.ss-preview-stack { display: grid; gap: var(--ss-space-6); }
.ss-preview-copy {
  margin: 0;
  color: var(--ss-color-text-muted);
  font-size: var(--ss-font-size-md);
  line-height: 1.6;
}
.ss-preview-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ss-space-3);
}
.ss-preview-swatch {
  display: grid;
  gap: var(--ss-space-1);
  justify-items: center;
}
.ss-preview-swatch__chip {
  display: block;
  width: 48px;
  height: 32px;
  border-radius: var(--ss-radii-sm);
  border: 1px solid var(--ss-color-surface-outline-strong);
}
.ss-preview-swatch__name {
  font-size: var(--ss-font-size-xs);
  color: var(--ss-color-text-faint);
  font-family: var(--ss-font-family-mono);
}
`;

/* Inject once — acceptable for a dev-only preview page; avoids touching the
   global stylesheet from the design module. */
if (
  typeof document !== "undefined" &&
  !document.getElementById("ss-preview-styles")
) {
  const style = document.createElement("style");
  style.id = "ss-preview-styles";
  style.textContent = previewStyles;
  document.head.appendChild(style);
}
