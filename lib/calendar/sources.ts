// Client-safe list of calendar feed sources (no server imports).
export const CALENDAR_SOURCES = [
  "meeting", "video", "notetaker", "event", "task", "mytask", "reminder",
  "crm_deal", "crm_activity", "time", "note", "doc", "drive", "clip", "whiteboard",
] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

export const SOURCE_META: Record<CalendarSource, { label: string; color: string; group: string }> = {
  meeting:      { label: "Meetings",        color: "rose",    group: "Schedule" },
  video:        { label: "Video meetings",  color: "pink",    group: "Schedule" },
  notetaker:    { label: "AI notetaker",    color: "fuchsia", group: "Schedule" },
  event:        { label: "Event types",     color: "violet",  group: "Schedule" },
  task:         { label: "Board tasks",     color: "sky",     group: "Work" },
  mytask:       { label: "My to-dos",       color: "cyan",    group: "Work" },
  reminder:     { label: "Reminders",       color: "amber",   group: "Work" },
  time:         { label: "Timesheet",       color: "teal",    group: "Work" },
  crm_deal:     { label: "CRM deals",       color: "emerald", group: "CRM" },
  crm_activity: { label: "CRM activities",  color: "lime",    group: "CRM" },
  note:         { label: "Notes",           color: "yellow",  group: "Content" },
  doc:          { label: "Docs",            color: "blue",    group: "Content" },
  drive:        { label: "Drive uploads",   color: "orange",  group: "Content" },
  clip:         { label: "Clips",           color: "red",     group: "Content" },
  whiteboard:   { label: "Whiteboards",     color: "indigo",  group: "Content" },
};
