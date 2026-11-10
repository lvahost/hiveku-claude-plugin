/**
 * Plain words for team chat, and the Discussions tools they mean.
 *
 * People ask for Discussions in their own words: "team chat", "read the launch channel", "post in a channel", "reply
 * in that thread", "make channels for every client", "my DMs". The catalogue says it differently (discussion_*,
 * thread_id, "a Discussions channel"), and scoring cannot bridge that. Measured on the index of 2026-11-09 (3,281
 * tools): "team chat" found only website chat tools, "make many channels" found discussion_channels_browse and
 * accounting_marketing_channels, "post in a channel" put discussion_channel_share_request_answer first, "reply in a
 * thread" offered the email inbox's thread reads, and "slack" offered a project's webhook test. No description should
 * carry those words instead: a customer reads them, and they never name another chat product.
 *
 * So these rules read the words a person types and name the tools that answer them; lib/tool-index.mjs puts those
 * first, in this order, ahead of the scored results. Each rule is narrow on purpose:
 *   - it needs a team chat word: a channel, a thread, team chat, Discussions, or the name of the chat product a team
 *     may be moving from (search maps the word to Hiveku's tools; nothing shows it to anyone), or, for the person's
 *     own conversations, a direct message, a group message, a private channel or a DM;
 *   - a word for another part of Hiveku with its own channels, threads or messages (an email inbox, texts, a ticket,
 *     a site's comments, an ad or analytics channel, a social account, a phone line, a webhook) turns every rule off,
 *     so "reply in the email thread" and "marketing channel roi" are left to the scoring as before;
 *   - a word that names one Discussions job by itself (unread, pin, share, archive, members, files...) turns the
 *     channel rules off too: the scoring finds that tool by its own name, and a rule would only push it down;
 *   - making or starting is never read as the person's own conversations: no tool makes one, so "start a DM" and
 *     "make a private channel" are left to the scoring, whose answers say so;
 *   - a make with something to read, post or search in it ("make a summary of the channel", "start a thread in the
 *     channel", "make a post in every channel") is not a new channel.
 * A name a rule gives that the catalogue does not carry (not served yet) is skipped there: a rule never invents a
 * result. Search is not a gate (lib/tool-index.mjs): this only orders what is found.
 */

const set = (...words) => new Set(words);
const any = (words, group) => words.some((w) => group.has(w));

/** The query's words, lower case. */
export function plainWords(query) {
  return String(query ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

const CHANNEL = set('channel', 'channels');
const THREAD = set('thread', 'threads');
const MESSAGE = set('message', 'messages', 'msg', 'msgs');
const CONVERSATION = set('conversation', 'conversations', 'chat', 'chats');

const MAKE = set('make', 'create', 'start', 'setup', 'add', 'build');
const MOVE = set('import', 'importing', 'migrate', 'migrating', 'migration', 'move', 'moving', 'bring', 'copy',
  'recreate', 'transfer');
const MANY = set('many', 'several', 'bulk', 'lots', 'all', 'multiple', 'batch', 'dozens', 'hundreds', 'every', 'each');
const POST = set('post', 'posting', 'send', 'write', 'announce', 'ping', 'reply', 'respond');
const REPLY = set('reply', 'replies', 'respond', 'answer');
const SEARCH = set('search', 'find', 'look', 'lookup', 'grep');
/** Verbs for reading. */
const READ_VERB = set('read', 'open', 'see', 'show', 'view', 'check', 'catch', 'summarize', 'summarise', 'recap');
/** Everything that asks to read: the verbs, and the nouns that ask for what was said. */
const READ = set(...READ_VERB, 'summary', 'history', 'messages', 'said', 'latest', 'happening', 'going');

/** Another part of Hiveku with its own channels, threads or messages: every rule stays out of it. */
const ELSEWHERE = set(
  'email', 'emails', 'mail', 'mails', 'inbox', 'inboxes', 'gmail', 'outlook', 'newsletter',
  'sms', 'mms', 'text', 'texts', 'texting', 'whatsapp',
  'voice', 'voicemail', 'voicemails', 'phone', 'phones', 'ring', 'call', 'calls',
  'ticket', 'tickets', 'helpdesk', 'website', 'visitor', 'visitors', 'widget', 'livechat',
  'comment', 'comments', 'review', 'reviews',
  'social', 'facebook', 'instagram', 'linkedin', 'tiktok', 'twitter', 'youtube', 'pinterest',
  'analytics', 'attribution', 'acquisition', 'roi', 'scorecard', 'ads', 'ad', 'ppc', 'adwords', 'campaign',
  'campaigns', 'revenue', 'traffic', 'utm', 'conversion', 'conversions',
  'webflow', 'cms', 'blog', 'sequence', 'sequences', 'outbound', 'prospect', 'prospects',
  'webhook', 'webhooks', 'integration', 'integrations', 'alert', 'alerts', 'test', 'testing',
);

/** One Discussions job named by itself: the scoring finds its tool by name, so the channel rules stay out. */
const ONE_JOB = set(
  'unread', 'unreads', 'pin', 'pins', 'pinned', 'unpin', 'save', 'saved', 'schedule', 'scheduled',
  'file', 'files', 'attachment', 'attachments', 'upload', 'huddle', 'recording', 'recordings', 'transcript',
  'webinar', 'status', 'notification', 'notifications', 'mute', 'muted',
  'share', 'shared', 'sharing', 'unshare', 'request', 'requests',
  'archive', 'archived', 'unarchive', 'delete', 'remove', 'leave', 'join', 'browse',
  'member', 'members', 'people', 'person', 'someone', 'somebody', 'teammate', 'teammates', 'participant',
  'participants', 'user', 'users', 'invite',
  'react', 'reaction', 'reactions', 'emoji', 'gif', 'edit', 'rename', 'topic', 'description',
  'follow', 'unfollow', 'following', 'hide', 'hidden', 'unhide', 'typing', 'presence',
  'board', 'boards', 'hiveboard', 'hiveboards', 'task', 'tasks', 'convert', 'agent', 'agents', 'link', 'links',
  'preview', 'previews',
);

/** The team's chat as a whole: Discussions, team chat, or the chat product a team may be moving from. */
function teamChat(words) {
  return words.includes('slack') || words.includes('discussions') || words.includes('discussion')
    || (words.includes('team') && any(words, set('chat', 'chats')));
}

/** The person's own direct messages, group messages or private channels. */
function ownConversations(words) {
  return any(words, set('dm', 'dms'))
    || (words.includes('direct') && (any(words, MESSAGE) || any(words, CONVERSATION)))
    || (words.includes('group') && any(words, MESSAGE))
    || (words.includes('private') && (any(words, CHANNEL) || any(words, MESSAGE) || any(words, CONVERSATION)));
}

const makes = (words) => any(words, MAKE) || (words.includes('set') && words.includes('up'));

/** A make with nothing to read, post or search in it: a new channel, not a summary, a thread or a post. */
const makesAChannel = (words) => makes(words)
  && ![POST, MESSAGE, THREAD, READ, SEARCH].some((group) => any(words, group));

/** Where a channel rule applies: a channel, a thread (one, never the social app's plural alone), or the team chat. */
const inChat = (words) => any(words, CHANNEL) || words.includes('thread') || teamChat(words);

/**
 * The rules, most particular first. Each `when` reads the query's words (and `quiet`: no word names one Discussions
 * job by itself); the first that matches names the tools, in the order the search shows them. `says` is what the
 * person asked for, for the tests and for whoever reads this.
 */
export const PLAIN_WORD_RULES = [
  {
    says: 'the person\'s own direct messages, group messages or private channels, searched',
    when: (w) => ownConversations(w) && !makes(w) && any(w, SEARCH),
    tools: ['discussion_private_search', 'discussion_private_list', 'discussion_private_messages'],
  },
  {
    says: 'the person\'s own direct messages, group messages or private channels',
    when: (w) => ownConversations(w) && !makes(w),
    tools: ['discussion_private_list', 'discussion_private_messages', 'discussion_private_search'],
  },
  {
    says: 'many channels at once, or a team moving its chat over',
    when: (w, quiet) => quiet && !ownConversations(w) && (
      (any(w, CHANNEL) && (makesAChannel(w) || any(w, MOVE)) && (w.includes('channels') || any(w, MANY)))
      || (teamChat(w) && any(w, MOVE))),
    tools: ['discussion_channels_bulk_create', 'discussion_create'],
  },
  {
    says: 'one new channel',
    when: (w, quiet) => quiet && !ownConversations(w) && (w.includes('channel') || w.includes('discussion'))
      && makesAChannel(w),
    tools: ['discussion_create', 'discussion_channels_bulk_create'],
  },
  {
    says: 'a reply in a thread',
    when: (w, quiet) => quiet && any(w, THREAD) && any(w, REPLY) && !any(w, READ_VERB),
    tools: ['discussion_reply', 'discussion_messages_list'],
  },
  {
    says: 'a post in a channel',
    when: (w, quiet) => quiet && inChat(w) && any(w, POST) && !any(w, READ_VERB),
    tools: ['discussion_reply', 'discussion_list'],
  },
  {
    says: 'what was said, searched',
    when: (w, quiet) => quiet && inChat(w) && any(w, SEARCH),
    tools: ['discussion_search', 'discussion_messages_list'],
  },
  {
    says: 'a channel read',
    when: (w, quiet) => quiet && inChat(w) && any(w, READ),
    tools: ['discussion_messages_list', 'discussion_list', 'discussion_get'],
  },
  {
    says: 'the team chat',
    when: (w, quiet) => quiet && teamChat(w),
    tools: ['discussion_list', 'discussion_messages_list', 'discussion_search', 'discussion_reply'],
  },
];

/**
 * The Discussions tools the plain words of `query` mean, in the order to show them, or [] when no rule speaks for
 * them. Names only: the caller keeps those its catalogue carries.
 */
export function plainWordTools(query) {
  const words = plainWords(query);
  if (!words.length || any(words, ELSEWHERE)) return [];
  // The channel rules stay out of a query that names one Discussions job by itself; the person's own conversations
  // have no tool but their three reads, so those rules read past it ("unread DMs" still finds them).
  const quiet = !any(words, ONE_JOB);
  const rule = PLAIN_WORD_RULES.find((r) => r.when(words, quiet));
  return rule ? [...rule.tools] : [];
}
