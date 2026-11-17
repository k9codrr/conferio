export type ReminderKind = "reminder" | "mytask" | "voice";

/** "<kind>:<id>" (used by notification actions) or a plain Reminder id. */
export function parseReminderRef(raw: string): { kind: ReminderKind; id: string } {
  const [maybeKind, ...rest] = raw.split(":");
  if (rest.length && (maybeKind === "reminder" || maybeKind === "mytask" || maybeKind === "voice")) {
    return { kind: maybeKind, id: rest.join(":") };
  }
  return { kind: "reminder", id: raw };
}
