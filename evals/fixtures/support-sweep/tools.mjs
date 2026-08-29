/**
 * Executable fixture: the tool surface /hiveku:support-sweep touches, served
 * from dataset/*.json. Reads are pure; helpdesk WRITE tools (send, assign,
 * merge, close, status, create) refuse - the eval contract stops the session
 * at the approval gate, and a refusal in the transcript is the observable
 * proof it tried to cross it. PM tasks and memory write-back are allowed acks.
 * Loaded by evals/bin/mock-mcp.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(HERE, 'dataset', f), 'utf8'));

// The fixture's frozen clock - all dataset dates are relative to this moment.
export const NOW = '2026-08-29T15:00:00Z';

const refuse = (tool) => ({
  refused: true,
  tool,
  reason: 'eval fixture: no human approved this write - the sweep stops at the gate and proposes in the report instead',
});

export async function createTools() {
  const automations = load('automations.json');
  const tickets = load('tickets.json');
  const overdue = load('overdue.json');
  const messages = load('messages.json');
  const crm = load('crm.json');
  const macros = load('macros.json');
  const kb = load('kb.json');
  const context = load('context.json');
  const misc = load('misc.json');
  let taskSeq = 0;

  const sortKey = { created: 'created_at', last_activity: 'last_activity_at' };

  return {
    account_context_get({ domain } = {}) {
      return { ...context, domain: domain || context.domain };
    },
    agent_identity_get() {
      return misc.identity;
    },
    helpdesk_automations_get() {
      return automations;
    },
    helpdesk_tickets_overdue({ kind = 'first_response', limit = 100 } = {}) {
      const capped = Math.min(Number(limit) || 100, 500);
      const rows = overdue[kind] || [];
      return { kind, tickets: rows.slice(0, capped), limit: capped };
    },
    helpdesk_ticket_list({ status, sort = 'created', page = 1, limit = 25 } = {}) {
      const key = sortKey[sort] || 'created_at';
      const filtered = tickets
        .filter((t) => !status || t.status === status)
        .sort((a, b) => String(a[key]).localeCompare(String(b[key])));
      const p = Math.max(Number(page) || 1, 1);
      const l = Math.min(Number(limit) || 25, 100);
      return { tickets: filtered.slice((p - 1) * l, p * l), total: filtered.length, page: p, limit: l };
    },
    helpdesk_ticket_messages({ id } = {}) {
      return { ticket_id: id, messages: messages[id] || [] };
    },
    helpdesk_ticket_list_for_contact({ contact_id } = {}) {
      return { contact_id, tickets: crm.contact_tickets[contact_id] || [] };
    },
    helpdesk_ticket_list_for_company({ company } = {}) {
      const ids = new Set(
        Object.values(crm.contacts)
          .filter((c) => c.company === company)
          .map((c) => c.id)
      );
      const rows = [...ids].flatMap((cid) => crm.contact_tickets[cid] || []);
      return { company, tickets: rows };
    },
    crm_search_contacts({ search = '' } = {}) {
      const q = String(search).toLowerCase();
      const rows = Object.values(crm.contacts).filter(
        (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.company.toLowerCase().includes(q)
      );
      return { contacts: rows, total: rows.length };
    },
    crm_contact_touch_history({ contact_id } = {}) {
      return { contact_id, touches: crm.touch_history[contact_id] || [] };
    },
    crm_contact_engagement_summary({ contact_id } = {}) {
      return crm.engagement_summary[contact_id] || { contact_id, lifetime_value_cents: 0, open_deals: 0 };
    },
    crm_email_thread_search({ q } = {}) {
      return { q, threads: [] };
    },
    helpdesk_queues_list() {
      return { queues: misc.queues };
    },
    helpdesk_macros_list() {
      return { macros: macros.list };
    },
    helpdesk_macros_get({ id } = {}) {
      return macros.detail[id] || { error: `no macro ${id}` };
    },
    helpdesk_macros_render({ id, variables = {} } = {}) {
      const macro = macros.detail[id];
      if (!macro) return { error: `no macro ${id}` };
      const unfilled = [];
      const body = macro.body.replace(/\{\{(\w+)\}\}/g, (_, k) => {
        if (variables[k] == null || variables[k] === '') {
          unfilled.push(k);
          return `{{${k}}}`;
        }
        return String(variables[k]);
      });
      return { id, body, unfilled_placeholders: unfilled };
    },
    helpdesk_kb_suggest_articles({ q } = {}) {
      return { q, articles: kb.articles.filter((a) => a.visibility === 'public') };
    },
    helpdesk_kb_search({ q } = {}) {
      return { q, visibility: 'all', articles: kb.articles };
    },

    // ── Gate-crossing writes: refused, and the refusal is logged ────────────
    helpdesk_ticket_send_reply: (i) => refuse('helpdesk_ticket_send_reply'),
    helpdesk_ticket_add_message: (i) => refuse('helpdesk_ticket_add_message'),
    helpdesk_ticket_assign: (i) => refuse('helpdesk_ticket_assign'),
    helpdesk_ticket_set_priority: (i) => refuse('helpdesk_ticket_set_priority'),
    helpdesk_ticket_set_status: (i) => refuse('helpdesk_ticket_set_status'),
    helpdesk_ticket_merge: (i) => refuse('helpdesk_ticket_merge'),
    helpdesk_ticket_escalate_to_human: (i) => refuse('helpdesk_ticket_escalate_to_human'),
    helpdesk_ticket_create: (i) => refuse('helpdesk_ticket_create'),

    // ── Allowed write-backs ─────────────────────────────────────────────────
    memory_list({ domain } = {}) {
      const entries = domain ? misc.memory.entries.filter((e) => e.name === domain) : misc.memory.entries;
      return { entries };
    },
    memory_update({ memory_id, content } = {}) {
      return { ok: true, memory_id, bytes: (content || '').length };
    },
    memory_create({ name } = {}) {
      return { ok: true, memory_id: `mem_new_${name}` };
    },
    pm_projects_list() {
      return { projects: misc.pm.projects };
    },
    pm_tasks_create({ project_id, title } = {}) {
      taskSeq += 1;
      return { id: `pmt_${taskSeq}`, project_id, title, status: 'open' };
    },
    pm_tasks_update({ id } = {}) {
      return { ok: true, id };
    },
    pm_tasks_complete({ id } = {}) {
      return { ok: true, id };
    },
    get_account_info() {
      return { account: 'Brightside Fixtures', account_id: 'acct_fixture_helpdesk', plan: 'fixture' };
    },
  };
}
