/**
 * Timestamp handling for the timestamped tables (journal_logs, metric_readings,
 * fitness_entries).
 *
 * The client stamps the absolute instant (`recorded_at`) and reports the
 * timezone offset it was in (`tz_offset`, minutes EAST of UTC). The server
 * derives which local calendar day that instant belongs to, and rejects a
 * request whose `:date` disagrees. That keeps `recorded_at` and `entry_date`
 * consistent by construction instead of relying on two independent clocks.
 *
 * `recorded_at` is stored as an absolute instant; rendering back to a local
 * `HHmm` is the client's job.
 */

export type Stamp = { recorded_at: string; tz_offset: number };

/** Reject a device clock this far from the server's — it would land on the wrong day. */
const MAX_SKEW_MS = 24 * 60 * 60 * 1000;

/** UTC-12:00 .. UTC+14:00 */
const MIN_TZ_OFFSET = -720;
const MAX_TZ_OFFSET = 840;

export type StampResult =
  | { ok: true; stamp: Stamp; entryDate: string }
  | { ok: false; error: string };

/** The local calendar day (YYYY-MM-DD) an instant falls on at a given offset. */
export function deriveEntryDate(recordedAtMs: number, tzOffsetMinutes: number): string {
  return new Date(recordedAtMs + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** The calendar day before a YYYY-MM-DD (pure date arithmetic, timezone-agnostic). */
export function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Validate a request body's `recorded_at` + `tz_offset` and confirm they resolve
 * to `expectedDate` (the `:date` path param).
 */
export function readStamp(raw: unknown, expectedDate: string): StampResult {
  const body = (raw ?? {}) as { recorded_at?: unknown; tz_offset?: unknown };

  if (typeof body.recorded_at !== 'string') {
    return { ok: false, error: 'recorded_at (ISO 8601) is required' };
  }
  const ms = Date.parse(body.recorded_at);
  if (Number.isNaN(ms)) {
    return { ok: false, error: 'recorded_at must be a valid ISO 8601 timestamp' };
  }

  const tz = body.tz_offset;
  if (typeof tz !== 'number' || !Number.isInteger(tz) || tz < MIN_TZ_OFFSET || tz > MAX_TZ_OFFSET) {
    return {
      ok: false,
      error: `tz_offset must be an integer number of minutes in [${MIN_TZ_OFFSET}, ${MAX_TZ_OFFSET}]`,
    };
  }

  if (Math.abs(ms - Date.now()) > MAX_SKEW_MS) {
    return { ok: false, error: 'recorded_at is too far from server time; check the device clock' };
  }

  const entryDate = deriveEntryDate(ms, tz);
  if (entryDate !== expectedDate) {
    return {
      ok: false,
      error: `entry_date mismatch: recorded_at + tz_offset resolves to ${entryDate}, not ${expectedDate}`,
    };
  }

  return { ok: true, stamp: { recorded_at: new Date(ms).toISOString(), tz_offset: tz }, entryDate };
}
