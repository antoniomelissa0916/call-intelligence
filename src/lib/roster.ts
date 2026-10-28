import { getDb, schema } from "@/lib/db";

/**
 * Employee first names (office reps and technicians). PestLaunch syncs the team from the
 * company's CRM; here it is TEAM_ROSTER plus every rep already identified on a call.
 * Roster names are never masked as customer details.
 */
export function envRoster(): string[] {
  return (process.env.TEAM_ROSTER ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getRoster(): Promise<string[]> {
  const db = await getDb();
  const reps = await db.select({ name: schema.reps.name }).from(schema.reps);
  return [...new Set([...envRoster(), ...reps.map((r) => r.name)])];
}
