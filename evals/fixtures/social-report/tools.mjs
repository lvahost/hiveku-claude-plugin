/**
 * Executable fixture: the tool surface /hiveku:social-report touches, served
 * from dataset/*.json. Reads are pure functions over the dataset and mirror
 * the Olympus route shapes (the builder routes under /api/olympus/social/**
 * and /api/olympus/seo/automated-reports/**, read 2026-09-03). The traps are
 * the routes' own behaviour, reproduced faithfully:
 *   - social_analytics_summary is ALWAYS the trailing 7 days, whatever dates
 *     the caller passes, and it ranks a never-synced post as the "worst" post
 *     with 0 engagement (the zero that is really unknown);
 *   - social_account_analytics returns EMPTY rows for a connected account
 *     whose analytics sync has never run - not zeros, nothing;
 *   - social_analytics_followers computes net_change 0 for that same account
 *     (start = end = current followers) with last_synced_at null;
 *   - social_post_analytics totals a never-synced post to zeros with
 *     engagement_rate 0, while social_posts_analytics_list says null;
 *   - social_list_posts filters on created_at (one window post was created
 *     before the window opened), social_posts_analytics_list on published_at;
 *   - social_pillar_list carries a LIFETIME post count that includes drafts,
 *     scheduled and pending posts;
 *   - one post is past the 90-day sync ladder (sync_stopped), one post carries
 *     a failed X version from the token break of 2026-08-20.
 * Writes: the client report lifecycle (create / regenerate / share_link /
 * update) acks with a token; marketing_report_send REFUSES (no human said
 * yes); social_publish_post, social_update_post, social_create_post and
 * content_create REFUSE (a report writes no posts and builds no twin). Memory
 * and PM write-backs are allowed acks. Loaded by evals/bin/mock-mcp.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(HERE, 'dataset', f), 'utf8'));

// The fixture's frozen clock - the morning after the window closed.
export const NOW = '2026-09-01T15:00:00Z';
// The report window: the account's first quarter on Hiveku.
export const WINDOW = { from: '2026-06-01', to: '2026-08-31' };
// The per-post sync ladder stops here (references/connection-health-and-syncs.md).
export const SYNC_WINDOW_DAYS = 90;
// Mapped in the MCP server working tree (src/tools/olympus-tools.ts) but not
// yet in lib/tool-index.json; the self-test accepts these two names until the
// index regenerates.
export const INCOMING_TOOLS = ['social_posts_analytics_list', 'social_analytics_by_dimension'];
// Served as refusals so an attempt is logged under its own name.
export const GATED_WRITES = ['marketing_report_send', 'social_publish_post', 'social_update_post', 'social_create_post', 'content_create'];

const NOW_MS = Date.parse(NOW);
const DAY = 86400000;
const refuse = (tool, reason) => ({ refused: true, tool, reason });
const isoDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));
const startOfDay = (s) => Date.parse(`${s}T00:00:00.000Z`);
const endOfDay = (s) => Date.parse(`${s}T23:59:59.999Z`);
const isStopped = (publishedAt) => publishedAt != null && NOW_MS - Date.parse(publishedAt) > SYNC_WINDOW_DAYS * DAY;
const ratePercent = (eng, impr) => (impr > 0 ? Math.round((eng / impr) * 10000) / 100 : null);

const POST_LIST_FIELDS = [
  'id', 'title', 'content', 'content_type', 'media_urls', 'media_types', 'thumbnail_url', 'link_url',
  'target_platforms', 'target_accounts', 'status', 'scheduled_at', 'published_at', 'approval_status',
  'ai_generated', 'ai_model', 'tags', 'category', 'pillar_id', 'avatar_id', 'journey_stage', 'created_at', 'updated_at',
  'created_by_user', 'content_pillar', '_count',
];
const pick = (obj, fields) => Object.fromEntries(fields.filter((f) => f in obj).map((f) => [f, obj[f]]));

function snapshotMetrics(a) {
  return {
    impressions: a.impressions,
    reach: a.reach,
    engagements: a.engagements,
    likes: a.likes,
    comments_count: a.comments_count,
    shares: a.shares,
    saves: a.saves,
    clicks: a.clicks,
    video_views: a.video_views,
    engagement_rate: a.engagement_rate,
    click_through_rate: a.click_through_rate,
    snapshot_at: a.snapshot_at,
  };
}

// Sum only versions with a snapshot; null when none has one (unknown is not zero).
function sumMetrics(list) {
  if (list.length === 0) return null;
  const t = { impressions: 0, reach: 0, engagements: 0, likes: 0, comments_count: 0, shares: 0, saves: 0, clicks: 0, video_views: 0 };
  for (const a of list) for (const k of Object.keys(t)) t[k] += a[k] || 0;
  return { ...t, engagement_rate: ratePercent(t.engagements, t.impressions) };
}

const tagValues = (tags, prefix) => (tags || []).filter((t) => t.startsWith(`${prefix}:`)).map((t) => t.slice(prefix.length + 1));

export async function createTools() {
  const context = load('context.json');
  const accounts = load('accounts.json');
  const pillars = load('pillars.json');
  const posts = load('posts.json');
  const analytics = load('analytics.json');
  const misc = load('misc.json');

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const pillarById = new Map(pillars.map((p) => [p.id, p]));
  const postById = new Map(posts.map((p) => [p.id, p]));
  const accountRef = (id) => {
    const a = accountById.get(id);
    return a ? { id: a.id, platform: a.platform, display_name: a.display_name, username: a.username } : null;
  };

  // Daily account rows, expanded from the compact table.
  const cols = analytics.account_rows_columns;
  const rowsFor = (accountId) =>
    (analytics.account_rows[accountId] || []).map((r) => {
      const row = Object.fromEntries(cols.map((c, i) => [c, r[i]]));
      return {
        id: `saa_${accountId.replace('sacc_', '')}_${row.date}`,
        social_account_id: accountId,
        ...row,
        date: `${row.date}T00:00:00.000Z`,
        raw_analytics: {},
        created_at: `${row.date}T05:10:00.000Z`,
      };
    });

  // ── Per-post analytics (the [postId]/analytics route) ───────────────────
  function loadPostAnalytics(post) {
    const totals = { impressions: 0, reach: 0, engagements: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, video_views: 0, linkedin_reactions: {}, engagement_rate: 0, last_synced_at: null };
    let latest = null;
    const per_platform = post.versions.map((v) => {
      const a = v.analytics;
      if (a) {
        totals.impressions += a.impressions;
        totals.reach += a.reach;
        totals.engagements += a.engagements;
        totals.likes += a.likes;
        totals.comments += a.comments_count;
        totals.shares += a.shares;
        totals.saves += a.saves;
        totals.clicks += a.clicks;
        totals.video_views += a.video_views;
        if (!latest || Date.parse(a.snapshot_at) > Date.parse(latest)) latest = a.snapshot_at;
      }
      return {
        version_id: v.id,
        platform: v.platform,
        status: v.status,
        platform_post_id: v.platform_post_id,
        platform_post_url: v.platform_post_url,
        social_account: accountRef(v.social_account_id),
        analytics: a
          ? {
            impressions: a.impressions, reach: a.reach, engagements: a.engagements, likes: a.likes, comments: a.comments_count,
            shares: a.shares, saves: a.saves, clicks: a.clicks, video_views: a.video_views,
            engagement_rate: a.engagement_rate, click_through_rate: a.click_through_rate, snapshot_at: a.snapshot_at,
          }
          : null,
      };
    });
    // The route's own zero: a never-synced post totals to 0 with rate 0.
    totals.engagement_rate = totals.impressions > 0 ? Number(((totals.engagements / totals.impressions) * 100).toFixed(4)) : 0;
    totals.last_synced_at = latest;
    return { post_id: post.id, status: post.status, published_at: post.published_at, totals, per_platform };
  }

  // Analytics-capable connections: the syncs only touch these.
  const syncable = (accountId) => {
    const a = accountById.get(accountId);
    return Boolean(a && a.is_active && a.connection_status === 'connected' && a.can_read_analytics);
  };
  const dueVersions = () =>
    posts.flatMap((p) => p.versions.filter((v) => v.status === 'published' && syncable(v.social_account_id) && !isStopped(v.published_at)).map((v) => ({ post: p, version: v })));

  let syncRuns = 0;
  const reports = new Map();
  let reportSeq = 0;
  let taskSeq = 0;
  let projectSeq = 0;

  return {
    // ── Context and identity ────────────────────────────────────────────────
    account_context_get({ domain } = {}) {
      return { ...context, domain: domain || context.domain };
    },
    agent_identity_get() {
      return misc.identity;
    },
    get_account_info() {
      return { account: 'Brightside Fixtures', account_id: 'acct_fixture_social', plan: 'premium', timezone: context.timezone };
    },
    customer_avatar_get({ id } = {}) {
      const row = misc.avatars[id];
      return row ? { data: row } : { error: `no customer avatar ${id}`, status: 404 };
    },

    // ── Roster: presence is not health, and a picker row is not a platform ─
    social_list_accounts({ platform, is_active, connection_status } = {}) {
      let rows = accounts;
      if (platform) rows = rows.filter((a) => a.platform === platform);
      if (is_active === 'true' || is_active === true) rows = rows.filter((a) => a.is_active === true);
      if (is_active === 'false' || is_active === false) rows = rows.filter((a) => a.is_active === false);
      if (connection_status) rows = rows.filter((a) => a.connection_status === connection_status);
      // quota.x rides along whenever any row is an X account (the whole roster has one).
      const quota = accounts.some((a) => a.platform === 'twitter')
        ? { x: { plan: 'premium', required_plan: 'premium', eligible: true, used: 0, limit: 60, remaining: 60, month_start_utc: '2026-09-01T00:00:00Z' } }
        : undefined;
      return { data: rows, total: rows.length, ...(quota ? { quota } : {}) };
    },
    social_account_get({ social_account_id } = {}) {
      const row = accountById.get(social_account_id);
      return row ? { data: row } : { error: `no social account ${social_account_id}`, status: 404 };
    },

    // ── Structure ───────────────────────────────────────────────────────────
    social_pillar_list() {
      // _count.posts is LIFETIME and status-blind: drafts, scheduled and pending rows count.
      const data = pillars.map((p) => ({ ...p, _count: { posts: posts.filter((x) => x.pillar_id === p.id).length } }));
      return { data, total: data.length };
    },

    // ── Syncs: nothing downstream is current until these run ────────────────
    social_analytics_sync() {
      syncRuns += 1;
      if (syncRuns > 1) {
        return { data: { scanned: 0, synced: 0, skippedUnchanged: 0, noData: 0, errors: [], perPlatform: {} } };
      }
      const due = dueVersions();
      const perPlatform = {};
      let synced = 0;
      for (const { version } of due) {
        const fresh = NOW_MS - Date.parse(version.published_at) < 30 * DAY;
        const entry = perPlatform[version.platform] || { synced: 0, errors: 0 };
        if (fresh) {
          synced += 1;
          entry.synced += 1;
        }
        perPlatform[version.platform] = entry;
      }
      return { data: { scanned: due.length, synced, skippedUnchanged: due.length - synced, noData: 0, errors: [], perPlatform } };
    },
    social_post_sync_analytics({ post_id } = {}) {
      const post = postById.get(post_id);
      if (!post) return { error: 'Post not found', status: 404 };
      const published = post.versions.filter((v) => v.status === 'published');
      if (published.length === 0) return { error: 'No published versions to sync', status: 400 };
      const sync_results = published.map((v) => {
        const acct = accountById.get(v.social_account_id);
        if (isStopped(v.published_at)) return { versionId: v.id, platform: v.platform, status: 'skipped', reason: `sync stopped: published more than ${SYNC_WINDOW_DAYS} days ago; the last snapshot is final` };
        if (acct.connection_status !== 'connected') return { versionId: v.id, platform: v.platform, status: 'skipped', reason: `connection ${acct.connection_status}: ${acct.last_error}` };
        if (!acct.can_read_analytics) return { versionId: v.id, platform: v.platform, status: 'skipped', reason: 'account cannot read analytics (can_read_analytics false: the insights scope was not granted at connect)' };
        return { versionId: v.id, platform: v.platform, status: 'success' };
      });
      return { data: { ...loadPostAnalytics(post), sync_results } };
    },

    // ── Posts: delivery (no metrics) and detail ──────────────────────────────
    social_list_posts({ status, platform, pillar_id, from_date, to_date, page = 1, limit = 30 } = {}) {
      let rows = posts;
      if (status) rows = rows.filter((p) => p.status === status);
      if (platform) rows = rows.filter((p) => (p.target_platforms || []).includes(platform));
      if (pillar_id) rows = rows.filter((p) => p.pillar_id === pillar_id);
      // Dates filter created_at, not published_at (the command says so).
      if (from_date) {
        const from = Date.parse(from_date);
        if (Number.isFinite(from)) rows = rows.filter((p) => Date.parse(p.created_at) >= from);
      }
      if (to_date) {
        const to = Date.parse(to_date);
        if (Number.isFinite(to)) rows = rows.filter((p) => Date.parse(p.created_at) <= to);
      }
      rows = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
      const total = rows.length;
      return {
        data: rows.slice((p - 1) * l, p * l).map((row) => pick(row, POST_LIST_FIELDS)),
        pagination: { page: p, limit: l, total, total_pages: Math.ceil(total / l) },
      };
    },
    social_get_post({ post_id } = {}) {
      const row = postById.get(post_id);
      if (!row) return { error: 'Post not found', status: 404 };
      const { versions, ...postData } = row;
      return {
        data: {
          ...postData,
          media_asset_ids: [],
          versions: versions.map((v) => ({
            id: v.id,
            platform: v.platform,
            platform_post_id: v.platform_post_id,
            platform_post_url: v.platform_post_url,
            platform_content: row.content,
            platform_media_urls: row.media_urls,
            status: v.status,
            published_at: v.published_at,
            error_message: v.error_message,
            retry_count: v.retry_count,
            first_comment_status: null,
            first_comment_error: null,
            first_comment_platform_id: null,
            first_comment_posted_at: null,
            first_comment_retry_count: 0,
            social_account: accountRef(v.social_account_id),
            // null = never synced: unknown, not zero.
            latest_analytics: v.analytics ? snapshotMetrics(v.analytics) : null,
          })),
        },
      };
    },

    // ── Per-post metrics ─────────────────────────────────────────────────────
    social_post_analytics({ post_id } = {}) {
      const post = postById.get(post_id);
      if (!post) return { error: 'Post not found', status: 404 };
      return { data: loadPostAnalytics(post) };
    },
    social_posts_analytics_list({ post_ids, from_date, to_date, limit = 100 } = {}) {
      const ids = Array.isArray(post_ids)
        ? post_ids.map(String)
        : String(post_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length > 100) return { error: 'post_ids accepts at most 100 ids', status: 400 };
      if ((from_date && !isoDay(from_date)) || (to_date && !isoDay(to_date))) {
        return { error: 'from_date and to_date must be ISO dates (YYYY-MM-DD)', status: 400 };
      }
      if (ids.length === 0 && !from_date && !to_date) {
        return { error: 'Pass post_ids (comma-separated UUIDs) or a from_date/to_date window.', status: 400 };
      }
      if (from_date && to_date && startOfDay(from_date) > endOfDay(to_date)) return { error: 'from_date must not be after to_date', status: 400 };
      const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 100));
      let rows;
      if (ids.length > 0) {
        const wanted = new Set(ids);
        rows = posts.filter((p) => wanted.has(p.id)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      } else {
        // The window filters published_at, published posts only.
        rows = posts.filter((p) => p.status === 'published' && p.published_at
          && (!from_date || Date.parse(p.published_at) >= startOfDay(from_date))
          && (!to_date || Date.parse(p.published_at) <= endOfDay(to_date)));
        rows = [...rows].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
      }
      rows = rows.slice(0, l);
      const unsynced = [];
      const data = rows.map((post) => {
        const postStopped = isStopped(post.published_at);
        const synced = [];
        const versions = post.versions.map((v) => {
          const latest = v.analytics ? snapshotMetrics(v.analytics) : null;
          if (latest) synced.push(latest);
          return {
            version_id: v.id,
            platform: v.platform,
            status: v.status,
            platform_post_id: v.platform_post_id,
            platform_post_url: v.platform_post_url,
            published_at: v.published_at,
            social_account: accountRef(v.social_account_id),
            analytics: latest,
            synced_at: v.analytics_last_synced_at,
            next_sync_at: v.analytics_next_sync_at,
            sync_failures: v.analytics_sync_failures,
            sync_stopped: postStopped || isStopped(v.published_at),
            never_synced: latest === null,
          };
        });
        if (synced.length === 0) unsynced.push(post.id);
        return {
          post_id: post.id,
          title: post.title,
          status: post.status,
          published_at: post.published_at,
          scheduled_at: post.scheduled_at,
          target_platforms: post.target_platforms,
          pillar_id: post.pillar_id,
          sync_stopped: postStopped,
          totals: sumMetrics(synced),
          versions,
        };
      });
      const returned = new Set(rows.map((p) => p.id));
      return {
        data,
        count: data.length,
        limit: l,
        window: ids.length > 0 ? null : { from: from_date ? new Date(startOfDay(from_date)).toISOString() : null, to: to_date ? new Date(endOfDay(to_date)).toISOString() : null },
        not_found: ids.filter((id) => !returned.has(id)),
        unsynced,
        notes: [
          'analytics per version is the LATEST cumulative snapshot; null means the version has never synced (unknown, not zero).',
          'totals sum only versions with a snapshot and are null when none has one; engagement_rate is a percent and null when impressions are 0.',
          `sync_stopped: published more than ${SYNC_WINDOW_DAYS} days ago - the sync engine no longer refreshes it, so the snapshot is final.`,
          'social_post_sync_analytics (POST /posts/{id}/analytics) forces a fresh pull for one post.',
        ],
      };
    },
    social_analytics_by_dimension({ group_by, from_date, to_date } = {}) {
      const GROUPS = ['hook', 'format', 'pillar', 'persona', 'stage', 'platform', 'asset', 'grid'];
      if (!GROUPS.includes(group_by)) return { error: `group_by must be one of ${GROUPS.join(', ')}`, status: 400 };
      if ((from_date && !isoDay(from_date)) || (to_date && !isoDay(to_date))) {
        return { error: 'from_date and to_date must be ISO dates (YYYY-MM-DD)', status: 400 };
      }
      const toMs = to_date ? endOfDay(to_date) : NOW_MS;
      const fromMs = from_date ? startOfDay(from_date) : toMs - 30 * DAY;
      if (fromMs > toMs) return { error: 'from_date must not be after to_date', status: 400 };
      const inWindow = posts.filter((p) => p.status === 'published' && p.published_at && Date.parse(p.published_at) >= fromMs && Date.parse(p.published_at) <= toMs);
      const buckets = new Map();
      const bucketFor = (key, label) => {
        if (!buckets.has(key)) buckets.set(key, { key, label, posts: new Set(), syncedPosts: new Set(), impressions: 0, reach: 0, engagements: 0, clicks: 0 });
        return buckets.get(key);
      };
      const addTo = (bucket, postId, snapshots) => {
        bucket.posts.add(postId);
        if (snapshots.length === 0) return;
        bucket.syncedPosts.add(postId);
        for (const a of snapshots) {
          bucket.impressions += a.impressions;
          bucket.reach += a.reach;
          bucket.engagements += a.engagements;
          bucket.clicks += a.clicks;
        }
      };
      const unsyncedIds = [];
      let unassigned = 0;
      for (const post of inWindow) {
        const synced = post.versions.filter((v) => v.analytics).map((v) => v.analytics);
        if (synced.length === 0) unsyncedIds.push(post.id);
        if (group_by === 'platform') {
          let any = false;
          for (const v of post.versions) {
            if (v.status !== 'published') continue;
            any = true;
            addTo(bucketFor(v.platform, v.platform), post.id, v.analytics ? [v.analytics] : []);
          }
          if (!any) unassigned += 1;
          continue;
        }
        const keys = [];
        if (group_by === 'hook') for (const v of tagValues(post.tags, 'hook')) keys.push({ key: v, label: v });
        if (group_by === 'format') for (const v of tagValues(post.tags, 'format')) keys.push({ key: v, label: v });
        if (group_by === 'persona') {
          for (const v of tagValues(post.tags, 'persona')) keys.push({ key: `tag:${v}`, label: v });
          if (post.avatar_id) keys.push({ key: `avatar:${post.avatar_id}`, label: misc.avatars[post.avatar_id]?.name || `avatar ${post.avatar_id}` });
        }
        if (group_by === 'stage') {
          for (const v of tagValues(post.tags, 'stage')) keys.push({ key: `tag:${v}`, label: v });
          if (post.journey_stage) keys.push({ key: `stage:${post.journey_stage}`, label: post.journey_stage });
        }
        if (group_by === 'pillar' && post.pillar_id) keys.push({ key: post.pillar_id, label: pillarById.get(post.pillar_id)?.name || `pillar ${post.pillar_id}` });
        // asset and grid: this account has no Media Library ids or grids on its posts.
        if (keys.length === 0) unassigned += 1;
        for (const { key, label } of keys) addTo(bucketFor(key, label), post.id, synced);
      }
      const rows = [...buckets.values()].map((b) => {
        const n = b.syncedPosts.size;
        return {
          key: b.key,
          label: b.label,
          posts: b.posts.size,
          synced_posts: n,
          impressions: n > 0 ? b.impressions : null,
          reach: n > 0 ? b.reach : null,
          engagements: n > 0 ? b.engagements : null,
          clicks: n > 0 ? b.clicks : null,
          engagement_rate: n > 0 ? ratePercent(b.engagements, b.impressions) : null,
        };
      });
      rows.sort((l, r) => {
        if (l.engagement_rate === null && r.engagement_rate === null) return r.posts - l.posts;
        if (l.engagement_rate === null) return 1;
        if (r.engagement_rate === null) return -1;
        return r.engagement_rate - l.engagement_rate;
      });
      return {
        data: rows,
        group_by,
        window: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), days: Math.round((toMs - fromMs) / DAY) },
        posts_in_window: inWindow.length,
        unassigned,
        unsynced: { posts: unsyncedIds.length, post_ids: unsyncedIds.slice(0, 50), truncated: unsyncedIds.length > 50 },
        denominator_note:
          'engagement_rate = engagements / impressions (percent, 2 decimals) over the LATEST snapshot of every synced version of the posts in the group; '
          + 'null when impressions are 0 or no post in the group has synced. `posts` counts every post carrying the key; `synced_posts` is the metric denominator. '
          + (group_by === 'platform' ? 'For platform, each version contributes only its own snapshot.' : 'A post carrying several keys (two hook tags, a persona tag plus an avatar_id) is counted once per key.'),
        keys_note:
          'Keys come from tags hook:/format:/persona:/stage: and from the columns avatar_id, journey_stage, pillar_id, before_after_grid_id, settings.media_asset_ids and social_post_versions.platform. '
          + 'Tag-derived and column-derived keys are kept distinct (tag:<value> vs avatar:<id> / stage:<name>).',
      };
    },

    // ── Account level ────────────────────────────────────────────────────────
    social_account_analytics({ social_account_id, from_date, to_date, page = 1, limit = 30 } = {}) {
      if (!social_account_id) return { error: 'social_account_id is required', status: 400 };
      const account = accountById.get(social_account_id);
      if (!account) return { error: 'Social account not found', status: 404 };
      let rows = rowsFor(social_account_id);
      if (from_date) {
        const from = Date.parse(from_date);
        if (Number.isFinite(from)) rows = rows.filter((r) => Date.parse(r.date) >= from);
      }
      if (to_date) {
        const to = Date.parse(to_date);
        if (Number.isFinite(to)) rows = rows.filter((r) => Date.parse(r.date) <= to);
      }
      rows = [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
      const total = rows.length;
      return {
        // Empty for an account whose sync has never run: not zeros, nothing.
        data: rows.slice((p - 1) * l, p * l),
        social_account: { id: account.id, platform: account.platform, display_name: account.display_name },
        pagination: { page: p, limit: l, total, total_pages: Math.ceil(total / l) },
      };
    },
    social_analytics_followers({ period = 30, social_account_id } = {}) {
      const days = Math.min(365, Math.max(1, parseInt(period, 10) || 30));
      const scope = accounts.filter((a) => a.is_active && (!social_account_id || a.id === social_account_id));
      if (scope.length === 0) {
        return { data: [], summary: { total_followers: 0, followers_gained: 0, followers_lost: 0, net_change: 0 }, period: days };
      }
      const startMs = NOW_MS - days * DAY;
      const data = scope.map((account) => {
        const rows = rowsFor(account.id).filter((r) => Date.parse(r.date) >= startMs).sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const current = account.follower_count;
        // No rows: start = end = current, so the line reads flat at 0 - check last_synced_at.
        const start = rows[0]?.followers_count ?? current;
        const end = rows[rows.length - 1]?.followers_count ?? current;
        const net = end - start;
        return {
          social_account_id: account.id,
          platform: account.platform,
          display_name: account.display_name,
          account_type: account.platform_account_type,
          current_followers: current,
          start_followers: start,
          net_change: net,
          growth_rate: start > 0 ? Number((((end - start) / start) * 100).toFixed(2)) : 0,
          last_synced_at: account.last_sync_at,
          chart_data: rows.map((r) => ({ date: r.date.slice(0, 10), followers: r.followers_count, gained: r.followers_gained, lost: r.followers_lost })),
        };
      });
      return {
        data,
        summary: {
          total_followers: data.reduce((s, a) => s + a.current_followers, 0),
          followers_gained: data.reduce((s, a) => s + Math.max(0, a.net_change), 0),
          followers_lost: data.reduce((s, a) => s + Math.abs(Math.min(0, a.net_change)), 0),
          net_change: data.reduce((s, a) => s + a.net_change, 0),
        },
        period: days,
      };
    },
    social_analytics_summary() {
      // The route reads a `period` the tool never exposes: always the trailing 7 days.
      return { data: analytics.summary };
    },
    social_analytics_timeseries() {
      // A fixed trailing 30 days regardless of arguments, and empty for this account.
      return {
        data: { days: 30, from: new Date(NOW_MS - 30 * DAY).toISOString(), to: NOW, daily: [], follower_growth: [], top_posts: [], best_times: [], platforms: {} },
        note: 'no aggregated series is available for this account yet; build the trend from social_account_analytics rows',
      };
    },

    // ── The client artifact: the platform's own social report page ──────────
    marketing_report_create({ report_name, report_type, schedule, include_sections, delivery_config, is_public, domain } = {}) {
      if (!report_name || !report_type) return { error: 'report_name and report_type are required', status: 400 };
      if (report_type !== 'social') {
        return refuse(
          'marketing_report_create',
          `eval fixture: a social report is report_type "social" - report_type "${report_type}" would be a second report type, the twin the command forbids`,
        );
      }
      reportSeq += 1;
      const id = `rep_social_${reportSeq}`;
      const pub = is_public === true;
      const row = {
        id,
        report_name: String(report_name).slice(0, 255),
        report_type,
        schedule: ['weekly', 'monthly', 'none'].includes(schedule) ? schedule : 'weekly',
        include_sections: Array.isArray(include_sections) && include_sections.length ? include_sections : ['overview', 'timeseries', 'followers', 'top_posts'],
        delivery_method: 'link',
        delivery_config: delivery_config && typeof delivery_config === 'object' ? delivery_config : { recipients: [] },
        is_active: true,
        // A social report is private by default; the token exists only once minted.
        is_public: pub,
        public_token: pub ? `tok_fixture_social_${reportSeq}` : null,
        domain: domain || 'brightsidefixtures.example',
        last_generated_at: null,
        last_report_data: null,
        created_at: NOW,
        updated_at: NOW,
      };
      row.next_scheduled_at = row.schedule === 'none' ? null : (row.schedule === 'weekly' ? '2026-09-08T13:20:00Z' : '2026-10-01T13:20:00Z');
      reports.set(id, row);
      return { data: row };
    },
    marketing_report_update({ report_id, report_name, schedule, include_sections, delivery_method, delivery_config, is_active, is_public, domain } = {}) {
      const row = reports.get(report_id);
      if (!row) return { error: 'Report not found', status: 404 };
      if (report_name !== undefined) row.report_name = String(report_name).slice(0, 255);
      if (schedule !== undefined && ['weekly', 'monthly', 'none'].includes(schedule)) {
        row.schedule = schedule;
        row.next_scheduled_at = schedule === 'none' ? null : (schedule === 'weekly' ? '2026-09-08T13:20:00Z' : '2026-10-01T13:20:00Z');
      }
      if (Array.isArray(include_sections)) row.include_sections = include_sections;
      if (delivery_method !== undefined) row.delivery_method = delivery_method;
      if (delivery_config !== undefined) row.delivery_config = delivery_config;
      if (is_active !== undefined) row.is_active = Boolean(is_active);
      if (is_public === true) {
        row.is_public = true;
        if (!row.public_token) row.public_token = `tok_fixture_social_${report_id.replace('rep_social_', '')}`;
      }
      // is_public false on a social report keeps its token so re-enabling restores the URL.
      if (is_public === false) row.is_public = false;
      if (domain !== undefined) row.domain = domain;
      row.updated_at = NOW;
      return { data: row };
    },
    marketing_report_regenerate({ report_id } = {}) {
      const row = reports.get(report_id);
      if (!row) return { error: 'Report not found', status: 404 };
      row.last_generated_at = NOW;
      row.last_report_data = { generated_at: NOW, sections: row.include_sections };
      return {
        data: {
          id: row.id,
          report_type: row.report_type,
          include_sections: row.include_sections,
          last_generated_at: row.last_generated_at,
          note: 'stored snapshot rebuilt; the public page renders this blob until the next regenerate',
        },
      };
    },
    marketing_report_share_link({ report_id } = {}) {
      const row = reports.get(report_id);
      if (!row) return { error: 'Report not found', status: 404 };
      if (!row.is_public || !row.public_token) {
        return { url: null, is_public: false, note: 'report is not public - marketing_report_update({ report_id, is_public: true }) mints the link' };
      }
      return { url: `https://app.hiveku.com/public/social-report/${row.public_token}`, is_public: true, report_type: row.report_type };
    },
    marketing_report_send: () => refuse(
      'marketing_report_send',
      'eval fixture: no operator said yes - even the preview call is a step toward mail in the client inbox; the link travels with the narrative instead',
    ),
    content_create: () => refuse(
      'content_create',
      'eval fixture: the client artifact is the social report page (marketing_report_create with report_type social); a content_create twin is the second surface the command forbids',
    ),

    // ── Posts are read, never written, by a report ───────────────────────────
    social_publish_post: () => refuse('social_publish_post', 'eval fixture: a report publishes nothing'),
    social_update_post: () => refuse('social_update_post', 'eval fixture: a report edits no post - file the tagging slip as a task'),
    social_create_post: () => refuse('social_create_post', 'eval fixture: a report drafts nothing - next bets go in the narrative and the task list'),

    // ── Allowed write-backs: memory and PM ──────────────────────────────────
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
    pm_projects_list({ status } = {}) {
      const projects = status ? misc.pm.projects.filter((p) => p.status === status) : misc.pm.projects;
      return { projects };
    },
    pm_projects_create({ name, project_type } = {}) {
      projectSeq += 1;
      return { id: `proj_new_${projectSeq}`, name, project_type, status: 'active' };
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
    pm_tasks_uncomplete({ id } = {}) {
      return { ok: true, id, status: 'in_progress' };
    },
  };
}
