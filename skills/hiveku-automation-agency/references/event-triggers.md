# Event Triggers: the internal-event catalog and the trigger-row mechanics

Load this file when you are picking a trigger for something that happens INSIDE
Hiveku (a deal changes stage, a ticket is assigned, an invoice is paid, a Shopify
order lands, a PM task moves, a call completes) and you want the domain map before
calling the discovery tool, or when you are creating a `workflow_triggers` row for a
webhook, scheduled, or database trigger.

## The catalog

`workflow_event_trigger_types_list` is the authority at run time - always call it
rather than trusting a list in a file. As of this writing it returns 35 trigger node
types across 9 domains. Each entry carries `node_type` (snake_case canonical),
`node_type_camel` (the alias the engine also accepts), `object_type`, `event_type`,
a one-line description, and `output_shape_keys` - the keys that land in
`trigger.output` for your templates.

| Domain | Trigger node types |
|---|---|
| `crm` | `crm_contact_trigger`, `crm_deal_trigger`, `crm_deal_stage_changed_trigger`, `crm_contact_stage_changed_trigger`, `crm_contact_lead_status_changed_trigger`, `crm_activity_trigger`, `crm_task_due_trigger`, `crm_email_received_trigger`, `crm_call_logged_trigger`, `crm_sequence_enrolled_trigger`, `crm_tag_added_trigger` |
| `helpdesk` | `helpdesk_ticket_created_trigger`, `helpdesk_ticket_updated_trigger`, `helpdesk_ticket_assigned_trigger`, `helpdesk_ticket_resolved_trigger`, `helpdesk_new_message_trigger` |
| `billing` | `billing_invoice_trigger`, `billing_payment_trigger`, `billing_estimate_trigger`, `billing_subscription_trigger`, `billing_signature_trigger` |
| `shopify` | `shopify_order_trigger`, `shopify_order_created_trigger`, `shopify_order_updated_trigger`, `shopify_review_trigger`, `shopify_subscription_trigger` |
| `voice` | `voice_call_completed_trigger`, `voice_voicemail_trigger`, `voice_missed_call_trigger` |
| `pm` | `pm_task_created_trigger`, `pm_task_updated_trigger`, `pm_project_trigger` |
| `deploy` | `deploy_trigger` |
| `form` | `form_submitted_trigger` |
| `survey` | `survey_response_received_trigger` |

## Node versus row

An event trigger needs no `workflow_triggers` row. It is a graph node and nothing
else. Only webhook, scheduled and database triggers need the row, created with
`workflow_trigger_create({ workflow_id, name, node_id, trigger_type, config })` -
`name` and `node_id` are both required, and `node_id` is the id of the trigger node
you already added with `workflow_node_add`.

Call `workflow_trigger_types_list` before `workflow_trigger_create`: it returns the
infrastructure trigger types (`webhook`, `scheduled_trigger`, `database_trigger`)
and the config keys each reads. Trigger config is untyped and unknown keys are
silently ignored - a typo'd key does not error, it just does nothing.

## Using `output_shape_keys`

Read the chosen entry's `output_shape_keys` before writing any `{{...}}`: those are
the keys available to your templates as `{{trigger.output.<key>}}`. An expression
referencing a key the trigger does not emit is written through as the literal string,
not an error - `workflow_test` plus `would_have` is how you catch it.

Some CRM triggers need a backend emitter on the underlying write; the palette says so
per entry. A trigger with no live emitter is authorable and silent, which looks
exactly like a broken workflow. Confirm with `workflow_event_trigger_types_list`.
