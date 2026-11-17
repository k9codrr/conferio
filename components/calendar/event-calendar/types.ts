export type CalendarView = "month" | "week" | "day" | "agenda";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  color?: EventColor;
  label?: string;
  location?: string;
  /** Unified calendar feed: which module this item comes from */
  source?: string;
  /** Deep link into the owning module */
  href?: string;
  meta?: Record<string, any>;
}

export type EventColor =
  | "blue" | "orange" | "violet" | "rose" | "emerald" | "sky" | "pink" | "fuchsia" | "cyan"
  | "amber" | "teal" | "lime" | "yellow" | "red" | "indigo";
