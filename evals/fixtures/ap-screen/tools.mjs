/**
 * Executable fixture: the tool surface /hiveku:ap-screen touches, served from
 * dataset/*.json. Read handlers are pure functions over the dataset; the few
 * write tools the command legitimately uses (PM tasks, memory write-back)
 * return plausible acks and mutate nothing on disk, so every run starts from
 * the same state. Loaded by evals/bin/mock-mcp.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(HERE, 'dataset', f), 'utf8'));

// The fixture's frozen clock - all dataset dates are relative to this moment.
export const NOW = '2026-08-29T15:00:00Z';

export async function createTools() {
  const bills = load('bills.json');
  const aging = load('aging.json');
  const schedules = load('schedules.json');
  const vendors = load('vendors.json');
  const audit = load('audit.json');
  const memory = load('memory.json');
  const pm = load('pm.json');
  let taskSeq = 0;

  return {
    accounting_bill_list({ status = 'all', limit = 50, offset = 0 } = {}) {
      const all = status === 'all' ? bills : bills.filter((b) => b.status === status);
      const capped = Math.min(Number(limit) || 50, 200);
      const start = Number(offset) || 0;
      return { bills: all.slice(start, start + capped), total: all.length, limit: capped, offset: start };
    },
    accounting_ap_aging() {
      return aging;
    },
    accounting_bill_schedules_list() {
      return { schedules: schedules.list, total: schedules.list.length };
    },
    accounting_bill_schedule_get({ id } = {}) {
      return schedules.detail[id] || { error: `no schedule ${id}` };
    },
    accounting_vendor_get({ id } = {}) {
      return vendors[id] || { error: `no vendor ${id}` };
    },
    audit_query({ tool_name } = {}) {
      const rows = tool_name ? audit.rows.filter((r) => r.tool_name === tool_name) : audit.rows;
      return { rows, total: rows.length };
    },
    memory_list({ domain } = {}) {
      const entries = domain ? memory.entries.filter((e) => e.name === domain) : memory.entries;
      return { entries };
    },
    memory_update({ memory_id, content } = {}) {
      return { ok: true, memory_id, bytes: (content || '').length };
    },
    memory_create({ name } = {}) {
      return { ok: true, memory_id: `mem_new_${name}` };
    },
    pm_projects_list() {
      return { projects: pm.projects };
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
      return { account: 'Brightside Fixtures', account_id: 'acct_fixture_books', plan: 'fixture' };
    },
  };
}
