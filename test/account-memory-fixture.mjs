/**
 * One account_memory_get answer in the builder's real shape
 * (hiveku_builder src/lib/account-memory/agent-view.ts, AccountMemoryForAgents),
 * shared by the account-memory, pull and knowledge tests.
 */
export const ACCOUNT_MEMORY_SAMPLE = {
  data: {
    content: '## About the business\nFamily-run stairlift installer in Leeds.\n\n## Goals right now\nMore Yorkshire leads.\n',
    version: 7,
    updated_at: '2026-09-23T14:02:11.000Z',
    bytes: 90,
    suggestions: [
      { id: 'a1b2c3d4', at: '2026-09-23T15:30:00.000Z', source: 'Sales agent', text: 'Closed on Mondays from November to March.' },
      { id: 'e5f6a7b8', at: '2026-09-24T09:05:00.000Z', source: 'MCP (Claude Code)', text: 'Prefers phone calls to email.' },
    ],
    suggestions_version: 3,
    injected: '<account_memory>...</account_memory>',
    truncated: false,
  },
};
