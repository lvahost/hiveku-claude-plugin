/**
 * APP_KEY_ONLY_TOOLS: real tools on the ask list that lib/tool-index.json does not hold, because the server lists
 * them to the Hiveku app's own key alone (HK-1816, 2026-11-20).
 *
 * The tool index is built from the live tools/list an account's key is served (scripts/gen-tool-index.mjs --dir).
 * Since HK-1816 that list leaves out the app's own pages and changes: the workspaces_page_*, dashboards_page_*,
 * home_page_* and user_notifications_* families, the About your business changes and the agent switch, among
 * others. Their routes answer every other key 403 app_key_required, so no plugin connection can call them today.
 *
 * They stay on the ask list and in ALWAYS_ASK_WRITES on purpose: if a key that can call one ever reaches the plugin,
 * or the server lists one again, the prompt is already there. A rename is still caught: the MCP server's
 * permission-critical-tools.test.ts checks every ask-list name against its full registry, which holds these.
 *
 * test/permission-critical.test.mjs and test/tool-safety.test.mjs accept a name here as they accept PENDING_TOOLS.
 *
 * ★ An entry MUST be deleted once the index holds it again. permission-critical.test.mjs fails on any name below
 * that the index holds, so the regen that lists one again forces its cleanup here.
 */
export const APP_KEY_ONLY_TOOLS = new Set([
  'account_memory_restore',
  'account_memory_save',
  'account_memory_suggest',
  'account_memory_suggestion_keep',
  'account_memory_suggestions_remove',
  'account_memory_suggestions_restore',
  'agent_switch_set',
  'calendar_booking_create',
  'dashboards_page_action_run',
  'dashboards_page_copy',
  'dashboards_page_create',
  'dashboards_page_data_column_change',
  'dashboards_page_data_column_undo',
  'dashboards_page_data_row_update',
  'dashboards_page_data_rows_delete',
  'dashboards_page_data_rows_restore',
  'dashboards_page_data_table_create',
  'dashboards_page_data_table_delete',
  'dashboards_page_data_table_restore',
  'dashboards_page_data_table_update',
  'dashboards_page_data_tally_add_remove',
  'dashboards_page_data_tally_settings_save',
  'dashboards_page_data_tally_start_from_zero',
  'dashboards_page_data_workflow_writer_stop',
  'dashboards_page_delete',
  'dashboards_page_editor_add',
  'dashboards_page_editor_remove',
  'dashboards_page_home_set',
  'dashboards_page_publish',
  'dashboards_page_restore',
  'dashboards_page_rows_send',
  'dashboards_page_shared_home_save',
  'dashboards_page_sharing_set',
  'dashboards_page_tally_add',
  'dashboards_page_update',
  'dashboards_page_version_restore',
  'dashboards_page_widget_describe',
  'dashboards_page_workflow_button_run',
  'discussion_recording_delete',
  'meet_recording_delete',
  'workspaces_page_attention_item_update',
  'workspaces_page_attention_recheck',
  'workspaces_page_custom_field_create',
  'workspaces_page_custom_field_delete',
  'workspaces_page_custom_field_grants_set',
  'workspaces_page_custom_field_update',
  'workspaces_page_custom_field_value_set',
  'workspaces_page_dashboard_create',
  'workspaces_page_dashboard_delete',
  'workspaces_page_dashboard_home_set',
  'workspaces_page_dashboard_restore',
  'workspaces_page_dashboard_update',
  'workspaces_page_dashboard_version_restore',
  'workspaces_page_mc_lane_create',
  'workspaces_page_mc_lane_delete',
  'workspaces_page_mc_lane_update',
  'workspaces_page_mc_task_answer',
  'workspaces_page_mc_task_claim',
  'workspaces_page_mc_task_comment',
  'workspaces_page_mc_task_release',
  'workspaces_page_mc_task_transition',
  'workspaces_page_mc_task_update',
  'workspaces_page_partner_account_create',
  'workspaces_page_partner_branding_save',
  'workspaces_page_partner_payout_details_save',
  'workspaces_page_pm_project_update',
  'workspaces_page_pm_task_create',
  'workspaces_page_pm_task_update',
  'workspaces_page_prefs_save',
  'workspaces_page_view_create',
  'workspaces_page_view_delete',
  'workspaces_page_view_from_template',
  'workspaces_page_view_grants_set',
  'workspaces_page_view_update',
]);
