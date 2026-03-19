import type { CalendarEvent } from "@scope/types";
import type { ScopeDb } from "./client";
import { parseJson } from "./parseJson";

const mapCalendarEventRow = (row: {
  id: string;
  provider: CalendarEvent["provider"];
  provider_event_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  attendees_json: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}): CalendarEvent => ({
  id: row.id,
  provider: row.provider,
  providerEventId: row.provider_event_id,
  title: row.title,
  startsAt: row.starts_at,
  endsAt: row.ends_at ?? undefined,
  attendees: parseJson(row.attendees_json, [] as CalendarEvent["attendees"]),
  metadata: parseJson(row.metadata_json, undefined),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class CalendarEventRepo {
  constructor(private readonly db: ScopeDb) {}

  upsert(event: CalendarEvent) {
    this.db.sqlite
      .prepare(
        `INSERT INTO calendar_events(
          id, provider, provider_event_id, title, starts_at, ends_at, attendees_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_event_id) DO UPDATE SET
          title = excluded.title,
          starts_at = excluded.starts_at,
          ends_at = excluded.ends_at,
          attendees_json = excluded.attendees_json,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at`
      )
      .run(
        event.id,
        event.provider,
        event.providerEventId,
        event.title,
        event.startsAt,
        event.endsAt ?? null,
        JSON.stringify(event.attendees),
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.createdAt,
        event.updatedAt
      );

    const row = this.db.sqlite
      .prepare(`SELECT * FROM calendar_events WHERE provider = ? AND provider_event_id = ?`)
      .get(event.provider, event.providerEventId) as
      | {
          id: string;
          provider: CalendarEvent["provider"];
          provider_event_id: string;
          title: string;
          starts_at: string;
          ends_at: string | null;
          attendees_json: string;
          metadata_json: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    return row ? mapCalendarEventRow(row) : event;
  }

  get(id: string): CalendarEvent | undefined {
    const row = this.db.sqlite.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id) as
      | {
          id: string;
          provider: CalendarEvent["provider"];
          provider_event_id: string;
          title: string;
          starts_at: string;
          ends_at: string | null;
          attendees_json: string;
          metadata_json: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return mapCalendarEventRow(row);
  }
}
