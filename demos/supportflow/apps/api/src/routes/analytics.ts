import { sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { analyticsQuerySchema, type AnalyticsDto, type OverviewDto } from "@supportflow/shared";
import { monthlyAiUsage } from "../ai/assistant";
import type { AppContext } from "../context";
import { parse } from "../lib/validate";
import { requireMember } from "../plugins/auth";
import { getOrgPlan } from "../services/workspace";

function rangeFor(days: number) {
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (days - 1)));
  return { from, to };
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function analyticsRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    app.get("/analytics/overview", async (request): Promise<OverviewDto> => {
      const member = await requireMember(ctx, request);
      const { days } = parse(analyticsQuerySchema, request.query);
      const { from, to } = rangeFor(days);
      const org = member.orgId;
      const fromIso = from.toISOString();

      const totals = await ctx.db.execute<Record<string, unknown>>(sql`
        select
          (select count(*) from conversations where org_id = ${org} and created_at >= ${fromIso}::timestamptz) as conversations,
          (select count(*) from conversations where org_id = ${org} and status <> 'resolved') as open_conversations,
          (select count(*) from conversations where org_id = ${org} and created_at >= ${fromIso}::timestamptz and ai_assisted) as ai_assisted,
          (select count(*) from tickets where org_id = ${org} and status not in ('resolved', 'closed')) as open_tickets,
          (select count(*) from tickets where org_id = ${org} and resolved_at >= ${fromIso}::timestamptz) as resolved_tickets,
          (select percentile_cont(0.5) within group (order by extract(epoch from first_response_at - created_at))
             from conversations where org_id = ${org} and created_at >= ${fromIso}::timestamptz and first_response_at is not null) as median_first_response,
          (select percentile_cont(0.5) within group (order by extract(epoch from resolved_at - created_at))
             from conversations where org_id = ${org} and resolved_at >= ${fromIso}::timestamptz) as median_resolution
      `);
      const t = totals[0] ?? {};

      const workload = await ctx.db.execute<Record<string, unknown>>(sql`
        select u.id as user_id, u.name,
          (select count(*) from conversations c where c.org_id = ${org} and c.assignee_id = u.id and c.status <> 'resolved') as open_conversations,
          (select count(*) from tickets k where k.org_id = ${org} and k.owner_id = u.id and k.status not in ('resolved', 'closed')) as open_tickets
        from memberships m join users u on u.id = m.user_id
        where m.org_id = ${org}
        order by open_conversations desc, u.name asc
      `);
      const [seatRow] = await ctx.db.execute<{ n: number }>(
        sql`select count(*)::int as n from memberships where org_id = ${org}`,
      );
      const plan = await getOrgPlan(ctx.db, org);

      return {
        range: { from: from.toISOString(), to: to.toISOString(), days },
        totals: {
          conversations: num(t.conversations),
          openConversations: num(t.open_conversations),
          aiAssistedConversations: num(t.ai_assisted),
          openTickets: num(t.open_tickets),
          resolvedTickets: num(t.resolved_tickets),
          medianFirstResponseSeconds: numOrNull(t.median_first_response),
          medianResolutionSeconds: numOrNull(t.median_resolution),
        },
        workload: workload.map((w) => ({
          userId: String(w.user_id),
          name: String(w.name),
          openConversations: num(w.open_conversations),
          openTickets: num(w.open_tickets),
        })),
        usage: {
          aiResponses: await monthlyAiUsage(ctx.db, org),
          aiLimit: plan.limits.aiResponsesPerMonth,
          seats: num(seatRow?.n),
          seatLimit: plan.limits.seats,
        },
      };
    });

    app.get("/analytics", async (request): Promise<AnalyticsDto> => {
      const member = await requireMember(ctx, request);
      const { days } = parse(analyticsQuerySchema, request.query);
      const { from, to } = rangeFor(days);
      const org = member.orgId;
      const fromIso = from.toISOString();
      const toIso = to.toISOString();

      const daily = await ctx.db.execute<Record<string, unknown>>(sql`
        with d as (
          select generate_series(${fromIso}::timestamptz at time zone 'UTC', ${toIso}::timestamptz at time zone 'UTC', interval '1 day')::date as day
        )
        select to_char(d.day, 'YYYY-MM-DD') as date,
          (select count(*) from conversations c where c.org_id = ${org} and (c.created_at at time zone 'UTC')::date = d.day) as conversations,
          (select count(*) from conversations c where c.org_id = ${org} and (c.resolved_at at time zone 'UTC')::date = d.day
             and c.ai_assisted
             and not exists (select 1 from messages m where m.conversation_id = c.id and m.author_type = 'agent' and not m.internal)) as ai_resolved,
          (select count(*) from ai_usage a where a.org_id = ${org} and a.kind = 'auto_reply' and a.outcome in ('escalated', 'error', 'limit')
             and (a.created_at at time zone 'UTC')::date = d.day) as escalated,
          (select count(*) from tickets k where k.org_id = ${org} and (k.created_at at time zone 'UTC')::date = d.day) as tickets_opened,
          (select count(*) from tickets k where k.org_id = ${org} and (k.resolved_at at time zone 'UTC')::date = d.day) as tickets_resolved,
          (select percentile_cont(0.5) within group (order by extract(epoch from c.first_response_at - c.created_at))
             from conversations c where c.org_id = ${org} and c.first_response_at is not null
             and (c.created_at at time zone 'UTC')::date = d.day) as median_first_response
        from d order by d.day
      `);

      const [ai] = await ctx.db.execute<Record<string, unknown>>(sql`
        select
          count(*) filter (where outcome in ('ok', 'escalated')) as responses,
          count(*) filter (where kind = 'auto_reply' and outcome in ('escalated', 'error', 'limit')) as escalations,
          count(*) filter (where outcome = 'error') as errors,
          count(*) filter (where outcome = 'limit') as limited,
          count(*) filter (where kind = 'auto_reply') as auto_attempts,
          coalesce(sum(input_tokens), 0) as input_tokens,
          coalesce(sum(output_tokens), 0) as output_tokens
        from ai_usage where org_id = ${org} and created_at >= ${fromIso}::timestamptz
      `);

      const [csat] = await ctx.db.execute<Record<string, unknown>>(sql`
        select count(*) as responses, avg(csat_rating) as average,
          count(*) filter (where csat_rating = 1) as r1, count(*) filter (where csat_rating = 2) as r2,
          count(*) filter (where csat_rating = 3) as r3, count(*) filter (where csat_rating = 4) as r4,
          count(*) filter (where csat_rating = 5) as r5
        from conversations where org_id = ${org} and csat_rating is not null and resolved_at >= ${fromIso}::timestamptz
      `);

      const autoAttempts = num(ai?.auto_attempts);
      const csatResponses = num(csat?.responses);
      return {
        range: { from: from.toISOString(), to: to.toISOString(), days },
        daily: daily.map((r) => ({
          date: String(r.date),
          conversations: num(r.conversations),
          aiResolved: num(r.ai_resolved),
          escalated: num(r.escalated),
          ticketsOpened: num(r.tickets_opened),
          ticketsResolved: num(r.tickets_resolved),
          medianFirstResponseSeconds: numOrNull(r.median_first_response),
        })),
        ai: {
          responses: num(ai?.responses),
          escalations: num(ai?.escalations),
          errors: num(ai?.errors),
          limited: num(ai?.limited),
          inputTokens: num(ai?.input_tokens),
          outputTokens: num(ai?.output_tokens),
        },
        escalationRate: autoAttempts > 0 ? num(ai?.escalations) / autoAttempts : null,
        csat:
          csatResponses > 0
            ? {
                responses: csatResponses,
                average: numOrNull(csat?.average),
                distribution: [csat?.r1, csat?.r2, csat?.r3, csat?.r4, csat?.r5].map(num),
              }
            : null,
      };
    });
  };
}
