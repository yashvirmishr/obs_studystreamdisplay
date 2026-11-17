export const PAGE_IDS = [
  "overview",
  "studio",
  "widgets",
  "integrations",
  "activity",
  "settings",
] as const;

export type PageId = (typeof PAGE_IDS)[number];

export interface NavItem {
  id: PageId;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "studio", label: "Overlay Studio" },
  { id: "widgets", label: "Widgets" },
  { id: "integrations", label: "Integrations" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];
