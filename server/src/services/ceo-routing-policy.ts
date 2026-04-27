import { and, asc, eq, inArray, not, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies } from "@paperclipai/db";
import { conflict } from "../errors.js";

const CEO_ROUTING_COMPANY_PREFIXES = new Set(["JARA"]);
const INACTIVE_AGENT_STATUSES = ["pending_approval", "terminated"] as const;

export const AUTO_CEO_APPROVER_USER_ID = "system:auto-ceo";

type CompanyPolicyRow = Pick<typeof companies.$inferSelect, "issuePrefix"> | null | undefined;

export function shouldApplyCeoRoutingPolicy(company: CompanyPolicyRow): boolean {
  return Boolean(company && CEO_ROUTING_COMPANY_PREFIXES.has(company.issuePrefix));
}

export function isCeoCandidate(agent: Pick<typeof agents.$inferSelect, "name" | "role" | "status">): boolean {
  if ((INACTIVE_AGENT_STATUSES as readonly string[]).includes(agent.status)) return false;
  return agent.role.toLowerCase() === "ceo" || agent.name.toLowerCase() === "ceo";
}

async function getCompanyPolicy(db: Db, companyId: string) {
  return db
    .select({ issuePrefix: companies.issuePrefix })
    .from(companies)
    .where(eq(companies.id, companyId))
    .then((rows) => rows[0] ?? null);
}

export async function getCeoRoutingAgent(db: Db, companyId: string) {
  const company = await getCompanyPolicy(db, companyId);
  if (!shouldApplyCeoRoutingPolicy(company)) return null;

  return db
    .select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
      status: agents.status,
    })
    .from(agents)
    .where(
      and(
        eq(agents.companyId, companyId),
        not(inArray(agents.status, [...INACTIVE_AGENT_STATUSES])),
        or(eq(sql`lower(${agents.role})`, "ceo"), eq(sql`lower(${agents.name})`, "ceo")),
      ),
    )
    .orderBy(
      asc(sql`case when lower(${agents.role}) = 'ceo' then 0 else 1 end`),
      asc(agents.createdAt),
      asc(agents.id),
    )
    .then((rows) => rows[0] ?? null);
}

export async function resolveDefaultCeoTaskAssigneeId(db: Db, companyId: string) {
  const company = await getCompanyPolicy(db, companyId);
  if (!shouldApplyCeoRoutingPolicy(company)) return null;

  const ceo = await getCeoRoutingAgent(db, companyId);
  if (!ceo) {
    throw conflict("JARVE task routing requires an active CEO agent");
  }
  return ceo.id;
}

export async function shouldAutoApproveCeoHireRequest(
  db: Db,
  companyId: string,
  actorAgentId: string | null | undefined,
) {
  if (!actorAgentId) return false;
  const ceo = await getCeoRoutingAgent(db, companyId);
  return ceo?.id === actorAgentId;
}
