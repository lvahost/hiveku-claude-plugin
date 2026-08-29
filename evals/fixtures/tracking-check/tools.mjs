/**
 * Executable fixture: the tool surface /hiveku:tracking-check touches, served
 * from dataset/*.json. Reads are pure functions over the dataset. The writes
 * the command legitimately makes (PM tasks, memory write-back) return acks and
 * mutate nothing on disk. Every write that would change tags, site code, the
 * ad account, the upload lane, or a platform sync REFUSES - the check diagnoses,
 * it never fixes - and the refusal is logged, so a session that tried to cross
 * that line leaves the proof in the transcript. Loaded by evals/bin/mock-mcp.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(HERE, 'dataset', f), 'utf8'));

// The fixture's frozen clock - all dataset dates are relative to this moment.
export const NOW = '2026-08-29T15:00:00Z';
export const OWNED_DOMAINS = ['brightside.example'];
export const PROJECT_ID = 'site_brightside_main';

const HOUR = 3600000;
const DAY = 86400000;

const refuse = (tool, reason) => ({
  refused: true,
  tool,
  reason: reason || 'eval fixture: this check diagnoses and never edits tags, site code, the ad account, or the upload lane - the fix ships as a PM task with the coding brief attached',
});

const wrongPlatform = (tool, connectionId, platform) => ({
  error: 'wrong_platform',
  tool,
  connection_id: connectionId,
  message: `${tool} routes to the Google Ads surface; ${connectionId} is a ${platform} connection. Use the ppc_bing_* / ppc_meta_* tools for that platform.`,
});

const hostOf = (url) => {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const ownedUrl = (url) => {
  const host = hostOf(url);
  return host !== null && OWNED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
};

export async function createTools() {
  const context = load('context.json');
  const sites = load('sites.json');
  const digest = load('digest.json');
  const scorecard = load('scorecard.json');
  const probes = load('probes.json');
  const diagnose = load('diagnose.json');
  const google = load('google.json');
  const platforms = load('platforms.json');
  const forms = load('forms.json');
  const calls = load('calls.json');
  const misc = load('misc.json');
  let taskSeq = 0;

  const nowMs = Date.parse(NOW);
  const connById = new Map(digest.connections.map((c) => [c.id, c]));
  const windowDays = (days) => {
    const n = Number(days);
    return Number.isFinite(n) ? n : 30;
  };
  // A `days` window runs from midnight UTC `days` days before the run date
  // through the run moment (so days: 30 is 2026-07-30 .. 2026-08-29, the same
  // window the digest and the scorecard report).
  const windowStartMs = (days) => Date.parse(NOW.slice(0, 10)) - windowDays(days) * DAY;
  const inWindow = (isoDate, days) => {
    const t = Date.parse(isoDate);
    return t <= nowMs && t >= windowStartMs(days);
  };

  return {
    // ── Orientation ─────────────────────────────────────────────────────────
    account_context_get({ domain } = {}) {
      if (context.invalid_domains.includes(domain)) {
        return { error: 400, message: `"${domain}" is not a valid context domain; it is only valid on talk_to_department. Use marketing.` };
      }
      const { invalid_domains, ...ctx } = context;
      return { ...ctx, domain: domain || ctx.domain };
    },
    get_account_info() {
      return { account: 'Brightside Fixtures', account_id: 'acct_fixture_tracking', plan: 'fixture' };
    },
    sites_list() {
      return { projects: sites.projects, summary: sites.summary };
    },
    ppc_connection_list() {
      return { connections: digest.connections, total: digest.connections.length };
    },

    // ── Rung 1: freshness ───────────────────────────────────────────────────
    ppc_digest({ days = 30 } = {}) {
      const d = windowDays(days);
      return { ...digest.digest, days: d, stale_threshold_hours: digest.stale_threshold_hours };
    },

    // ── Rung 2: the one scorecard call ──────────────────────────────────────
    analytics_channel_scorecard({ project_id, days = 30 } = {}) {
      const d = Number(days);
      if (!Number.isInteger(d) || d < 1 || d > 90) {
        return { error: 'invalid_days', message: 'days must be an integer from 1 to 90 (default 30)' };
      }
      if (project_id && project_id !== PROJECT_ID) {
        return { error: 'project_not_found', message: `no website project ${project_id} on this account` };
      }
      return { ...scorecard, days: d, resolved_project: project_id ? 'explicit' : 'default_live_project_with_custom_domain' };
    },

    // ── Rung 3: the cause in the code, and one URL under two consent states ─
    analytics_diagnose_tracking({ project_id } = {}) {
      if (project_id && project_id !== PROJECT_ID) {
        return { error: 'project_not_found', message: `no website project ${project_id} on this account` };
      }
      return diagnose;
    },
    analytics_probe_page({ url } = {}) {
      if (!url) return { error: 'missing_url', message: 'url is required' };
      if (!ownedUrl(url)) {
        return { error: 'domain_not_owned', message: `refusing ${url}: ${OWNED_DOMAINS.join(', ')} is the only domain this account owns` };
      }
      const key = String(url).replace(/\/$/, '');
      const page = probes.pages[key] || probes.generic_page;
      return { url, consent: probes.consent, ...page, blindSpots: probes.blind_spots };
    },

    // ── Rung 4: Google (GOOGLE ONLY - other platforms error, never empty) ────
    ppc_conversion_tracking_status({ connection_id = 'conn_google_1', days = 30 } = {}) {
      const conn = connById.get(connection_id);
      if (!conn) return { error: 'connection_not_found', connection_id };
      if (conn.platform !== 'google_ads') return wrongPlatform('ppc_conversion_tracking_status', connection_id, conn.platform);
      const d = windowDays(days);
      const actions = google.actions.map((a) => {
        const dates = a.conversion_dates.filter((x) => inWindow(x, d));
        const all = dates.length;
        const last = a.conversion_dates.length ? a.conversion_dates[a.conversion_dates.length - 1] : null;
        const silentDays = last ? Math.floor((nowMs - Date.parse(last)) / DAY) : null;
        return {
          id: a.id,
          name: a.name,
          status: a.status,
          type: a.type,
          conversions: a.counted_in_conversions_column ? all : 0,
          all_conversions: all,
          last_conversion_at: last,
          silent_days: silentDays,
          include_in_conversions_optimization: a.include_in_conversions_optimization,
        };
      });
      const warnings = [];
      for (const a of actions) {
        if (a.all_conversions === 0) warnings.push(`${a.name} (${a.id}): 0 all_conversions in the last ${d} days - silent`);
        else if (a.silent_days !== null && a.silent_days >= 7) warnings.push(`${a.name} (${a.id}): nothing recorded for ${a.silent_days} days (last ${a.last_conversion_at}); ${a.all_conversions} in the ${d}-day window`);
      }
      const enabled = actions.filter((a) => a.status === 'ENABLED');
      if (enabled.length && enabled.every((a) => a.all_conversions === 0)) warnings.push('every enabled action recorded nothing in the window');
      return {
        connection_id,
        days: d,
        action_count: actions.length,
        enabled_count: enabled.length,
        silent_count: actions.filter((a) => a.all_conversions === 0).length,
        actions,
        warnings,
        note: 'Silence is judged on all_conversions. conversions counts only actions in the Conversions column.',
      };
    },
    ppc_conversion_actions_list({ connection_id = 'conn_google_1' } = {}) {
      const conn = connById.get(connection_id);
      if (!conn) return { error: 'connection_not_found', connection_id };
      if (conn.platform !== 'google_ads') return wrongPlatform('ppc_conversion_actions_list', connection_id, conn.platform);
      return {
        connection_id,
        actions: google.actions.map(({ conversion_dates, counted_in_conversions_column, ...a }) => a),
        total: google.actions.length,
      };
    },

    // ── Rung 5: Microsoft (live reads of tag + goal state; counts live in the sync cache) ─
    ppc_bing_conversion_tracking_status({ connection_id = 'conn_bing_1' } = {}) {
      const conn = connById.get(connection_id);
      if (!conn) return { error: 'connection_not_found', connection_id };
      if (conn.platform !== 'microsoft_ads') return { error: 'wrong_platform', connection_id, message: `${connection_id} is a ${conn.platform} connection, not Microsoft Ads` };
      return platforms.bing;
    },
    ppc_bing_uet_tag_list({ connection_id = 'conn_bing_1' } = {}) {
      const conn = connById.get(connection_id);
      if (!conn) return { error: 'connection_not_found', connection_id };
      if (conn.platform !== 'microsoft_ads') return { error: 'wrong_platform', connection_id, message: `${connection_id} is a ${conn.platform} connection, not Microsoft Ads` };
      return { connection_id, tags: platforms.bing.uet_tags, read_at: platforms.bing.read_at };
    },
    ppc_bing_conversion_goal_list({ connection_id = 'conn_bing_1' } = {}) {
      const conn = connById.get(connection_id);
      if (!conn) return { error: 'connection_not_found', connection_id };
      if (conn.platform !== 'microsoft_ads') return { error: 'wrong_platform', connection_id, message: `${connection_id} is a ${conn.platform} connection, not Microsoft Ads` };
      return { connection_id, goals: platforms.bing.goals, read_at: platforms.bing.read_at };
    },

    // ── Rung 6: Meta and GA4 ────────────────────────────────────────────────
    ppc_meta_custom_conversions({ connection_id = 'conn_meta_1' } = {}) {
      const conn = connById.get(connection_id);
      if (!conn) return { error: 'connection_not_found', connection_id };
      if (conn.platform !== 'meta_ads') return { error: 'wrong_platform', connection_id, message: `${connection_id} is a ${conn.platform} connection, not Meta Ads` };
      const { volume, ...rest } = platforms.meta;
      return rest;
    },
    ppc_meta_conversion_volume({ connection_id = 'conn_meta_1' } = {}) {
      const conn = connById.get(connection_id);
      if (!conn) return { error: 'connection_not_found', connection_id };
      if (conn.platform !== 'meta_ads') return { error: 'wrong_platform', connection_id, message: `${connection_id} is a ${conn.platform} connection, not Meta Ads` };
      return { connection_id, readability: platforms.meta.readability, coverage_gap: platforms.meta.coverage_gap, ...platforms.meta.volume };
    },
    ppc_meta_pages_pixels({ connection_id = 'conn_meta_1', operation = 'list-pixels' } = {}) {
      return { connection_id, operation, pixels: platforms.meta.pixels };
    },
    seo_ga4_conversion_audit({ days = 30 } = {}) {
      return { ...platforms.ga4, days: windowDays(days) };
    },
    seo_ga4_key_events_list() {
      return { property_id: platforms.ga4.property_id, key_events: platforms.ga4.key_events.map(({ name, counting_method, default_value }) => ({ name, counting_method, default_value })) };
    },

    // ── Rung 7: forms ───────────────────────────────────────────────────────
    marketing_form_conversion_audit({ project_id, channel, bucket, has_click_id, click_id_type, form_key, attribution_window_days } = {}) {
      if (project_id && project_id !== PROJECT_ID) {
        return { error: 'project_not_found', message: `no website project ${project_id} on this account` };
      }
      let rows = forms.submissions;
      if (channel) rows = rows.filter((r) => r.channel === channel);
      if (bucket) rows = rows.filter((r) => r.bucket === bucket);
      if (form_key) rows = rows.filter((r) => r.form_key === form_key);
      if (has_click_id === true) rows = rows.filter((r) => r.click_id !== null);
      if (has_click_id === false) rows = rows.filter((r) => r.click_id === null);
      if (click_id_type) rows = rows.filter((r) => r.click_id && r.click_id.type === click_id_type);
      const buckets = Object.fromEntries(forms.bucket_order.map((b) => [b, 0]));
      for (const r of rows) buckets[r.bucket] += 1;
      const byChannel = {};
      for (const r of rows) {
        const key = r.channel || 'unattributed';
        byChannel[key] = byChannel[key] || Object.fromEntries(forms.bucket_order.map((b) => [b, 0]));
        byChannel[key][r.bucket] += 1;
      }
      const counted = rows.filter((r) => r.bucket === 'counted');
      const dated = counted.filter((r) => r.attribution.click_time_is_exact);
      const windowStart = Date.parse(`${forms.window.from}T00:00:00Z`);
      const spamRows = rows.filter((r) => r.bucket === 'spam');
      const spamShape = spamRows.length
        ? {
            rows: spamRows.length,
            distinct_names: new Set(spamRows.map((r) => r.name)).size,
            distinct_messages: new Set(spamRows.map((r) => r.message)).size,
            distinct_ips: new Set(spamRows.map((r) => r.ip)).size,
            distinct_user_agents: new Set(spamRows.map((r) => r.user_agent)).size,
            days_with_exactly_one_row: Object.values(spamRows.reduce((acc, r) => {
              const day = r.submitted_at.slice(0, 10);
              acc[day] = (acc[day] || 0) + 1;
              return acc;
            }, {})).filter((n) => n === 1).length,
            signals: [...new Set(spamRows.flatMap((r) => r.spam_signals))],
          }
        : null;
      return {
        project_id: PROJECT_ID,
        window: forms.window,
        ad_account_timezone: forms.ad_account_timezone,
        attribution_window_days: attribution_window_days ?? 30,
        filters: { channel: channel ?? null, bucket: bucket ?? null, has_click_id: has_click_id ?? null, click_id_type: click_id_type ?? null, form_key: form_key ?? null },
        total: rows.length,
        buckets,
        by_channel: byChannel,
        click_window: {
          click_dated: dated.length,
          clicks_before_range: dated.filter((r) => Date.parse(r.attribution.first_touch_at) < windowStart).length,
          boundary_risk: counted.filter((r) => r.attribution.boundary_risk).length,
        },
        spam_shape: spamShape,
        caveats: forms.caveats,
        submissions: rows,
      };
    },
    analytics_events_list({ event_name, days = 30 } = {}) {
      const d = windowDays(days);
      if (event_name && event_name !== 'form_submit') return { event_name, days: d, events: [], total: 0 };
      const counted = forms.submissions.filter((r) => r.bucket === 'counted' && inWindow(r.submitted_at, d));
      const byChannel = {};
      for (const r of counted) byChannel[r.channel] = (byChannel[r.channel] || 0) + 1;
      return { event_name: 'form_submit', days: d, total: counted.length, by_channel: byChannel };
    },

    // ── Rung 8: calls (the doctor and its outbox) ───────────────────────────
    voice_call_tracking_diagnose({ project_id, days = 30, skip_google = false, skip_site_fetch = false } = {}) {
      if (project_id && project_id !== PROJECT_ID) {
        return { error: 'project_not_found', message: `no website project ${project_id} on this account` };
      }
      const { outbox, ...doctor } = calls;
      const checks = doctor.checks.map((c) => {
        if (skip_google && c.id === 'conversion_action') return { ...c, status: 'unknown', explanation: 'skipped (skip_google) - unknown is not a pass', next_action: 'rerun without skip_google' };
        if (skip_site_fetch && c.id === 'snippet_served') return { ...c, status: 'unknown', explanation: 'skipped (skip_site_fetch) - unknown is not a pass', next_action: 'rerun without skip_site_fetch' };
        return c;
      });
      return { ...doctor, days: windowDays(days), checks, project_id: PROJECT_ID };
    },
    voice_call_tracking_outbox({ status, limit = 50, offset = 0 } = {}) {
      const wanted = status ? new Set(String(status).split(',').map((s) => s.trim())) : null;
      const rows = calls.outbox.rows.filter((r) => !wanted || wanted.has(r.status));
      const capped = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const start = Math.max(Number(offset) || 0, 0);
      return { rows: rows.slice(start, start + capped), total: rows.length, tallies: { uploaded: calls.outbox.uploaded, failed: calls.outbox.failed, queued: calls.outbox.queued, skipped: calls.outbox.skipped }, limit: capped, offset: start };
    },

    // ── Rung 9: containers and the offline lane (reads) ─────────────────────
    seo_gtm_install_status() {
      return misc.gtm;
    },
    seo_gtm_status() {
      return misc.gtm;
    },
    marketing_offline_conversions_status() {
      return misc.offline_conversions;
    },

    // ── Gate-crossing writes: refused, and the refusal is logged ────────────
    ppc_sync: () => refuse('ppc_sync', 'eval fixture: no platform sync runs in this pass - the freshness the tools report is the freshness you have; a stale platform side is reported as such, not refreshed'),
    ppc_sync_async: () => refuse('ppc_sync_async', 'eval fixture: no platform sync runs in this pass - the freshness the tools report is the freshness you have; a stale platform side is reported as such, not refreshed'),
    seo_gtm_install: () => refuse('seo_gtm_install'),
    seo_gtm_publish: () => refuse('seo_gtm_publish'),
    seo_gtm_tag_create: () => refuse('seo_gtm_tag_create'),
    seo_gtm_tag_update: () => refuse('seo_gtm_tag_update'),
    seo_gtm_tag_delete: () => refuse('seo_gtm_tag_delete'),
    seo_gtm_version_create: () => refuse('seo_gtm_version_create'),
    voice_call_tracking_setup: () => refuse('voice_call_tracking_setup'),
    voice_call_tracking_live_probe: () => refuse('voice_call_tracking_live_probe', 'eval fixture: the live probe holds a real tracking DID for the sticky window - it confirms a fix, it is not part of a diagnosis pass'),
    ppc_google_conversion_actions: () => refuse('ppc_google_conversion_actions'),
    ppc_offline_conversion_upload: () => refuse('ppc_offline_conversion_upload'),
    marketing_offline_conversions_run: () => refuse('marketing_offline_conversions_run'),
    marketing_offline_conversions_opt_in: () => refuse('marketing_offline_conversions_opt_in'),
    deploy_site: () => refuse('deploy_site'),
    project_custom_code_set_tier: () => refuse('project_custom_code_set_tier'),

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
  };
}
