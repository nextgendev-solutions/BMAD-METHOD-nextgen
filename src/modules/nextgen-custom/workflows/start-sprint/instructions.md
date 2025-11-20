# Start Sprint - Sprint Initialization Workflow

<critical>The workflow execution engine is governed by: {project-root}/bmad/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {project-root}/bmad/nextgen-custom/workflows/start-sprint/workflow.yaml</critical>
<critical>Communicate in {communication_language} throughout the workflow</critical>

<workflow>

<step n="1" goal="Fetch next future sprint from Jira">
<action>Communicate in {communication_language} with {user_name}</action>

<invoke-protocol name="delegate_to_jira_manager">
  <task>Get next future sprint</task>
  <agent>jira-manager (~/.claude/agents/jira-manager.md)</agent>
  <mcp-tool>mcp__MCP_DOCKER__jira_get_sprints_from_board</mcp-tool>
  <parameters>
    board_id: "{jira_board_id}"
    state: "future"
    limit: 1
  </parameters>
  <extract>
    sprint_id: response.values[0].id
    sprint_goal: response.values[0].goal
    sprint_number: extract number from response.values[0].name (e.g., "Sprint 1" → 1)
    sprint_name: response.values[0].name
  </extract>
</invoke-protocol>

<note>Store extracted values: sprint_id, sprint_goal, sprint_number, sprint_name</note>
</step>

<step n="2" goal="Start sprint in Jira">
<action>Communicate in {communication_language} with {user_name}</action>

<invoke-protocol name="delegate_to_jira_manager">
  <task>Start the sprint</task>
  <agent>jira-manager (~/.claude/agents/jira-manager.md)</agent>
  <mcp-tool>mcp__MCP_DOCKER__jira_update_sprint</mcp-tool>
  <parameters>
    sprint_id: "{sprint_id}"
    state: "active"
  </parameters>
  <note>Sprint name and goal already set during sprint planning</note>
</invoke-protocol>

<note>Sprint {sprint_number} is now active in Jira</note>
</step>

<step n="3" goal="Fetch all tickets in active sprint">
<action>Communicate in {communication_language} with {user_name}</action>

<invoke-protocol name="delegate_to_jira_manager">
  <task>Get all tickets in active sprint</task>
  <agent>jira-manager (~/.claude/agents/jira-manager.md)</agent>
  <mcp-tool>mcp__MCP_DOCKER__jira_search</mcp-tool>
  <parameters>
    jql: "project={jira_project_key} AND sprint IN openSprints() ORDER BY Rank ASC"
    limit: 50
  </parameters>
  <extract>
    sprint_tickets: response (array of tickets)
  </extract>
</invoke-protocol>

<note>Store sprint_tickets for validation</note>
</step>

<step n="4" goal="Validate sprint ticket prerequisites">
<action>Communicate in {communication_language} with {user_name}</action>

<validation-block>
  <requirement>All sprint tickets MUST have required checklists</requirement>

<action>For each ticket in {sprint_tickets}, verify checklists exist:</action>

  <invoke-protocol name="validate_checklist">
    <method>Jira REST API (MCP cannot read checklists directly)</method>
    <agent>jira-manager (~/.claude/agents/jira-manager.md)</agent>
    <note>Use Bash tool to execute curl for each ticket</note>

    <api-call>
      curl -s "https://api.jira.com/1/cards/{card_id}/checklists?key={key}&token={token}"
    </api-call>

    <required-checklists>
      - "Developer Implementation"
      - "Code Review"
      - "QA Validation"
    </required-checklists>

  </invoke-protocol>

  <check if="ANY ticket missing checklists">
    <action>Collect list of ticket keys missing checklists</action>
    <action>Report to {user_name}:</action>
    <message>
      ❌ Cannot start sprint - Tickets {missing_ticket_keys} missing required checklists

      **Action Required**: Run /project:prompts:create-jira workflow to add checklists to these tickets
    </message>
    <action>ABORT workflow - DO NOT create sprint branch</action>
    <return>validation_failed</return>

  </check>

  <check if="ALL tickets have checklists">
    <action>Report to {user_name}:</action>
    <message>✅ All {sprint_tickets.length} tickets have required checklists</message>
    <action>Proceed to next step</action>
  </check>
</validation-block>
</step>

<step n="5" goal="Create sprint branch in Git">
<action>Communicate in {communication_language} with {user_name}</action>

<note>Convert sprint goal to slug format</note>
<action>Create sprint_goal_slug:</action>
<algorithm>

1. Convert {sprint_goal} to lowercase
2. Replace spaces with hyphens
3. Remove special characters (keep only alphanumeric and hyphens)
4. Example: "Auth Foundation & Wallet UI" → "auth-foundation-wallet-ui"
   </algorithm>

<invoke-protocol name="delegate_to_git_manager">
  <task>Create sprint branch for Sprint {sprint_number}</task>
  <agent>git-manager (~/.claude/agents/git-manager.md)</agent>

  <steps>
    1. Checkout main: git checkout {git_main_branch}
    2. Pull latest: git pull origin {git_main_branch}
    3. Create sprint branch: git checkout -b {git_sprint_branch_prefix}{sprint_number}-{sprint_goal_slug}
    4. Push: git push -u origin {git_sprint_branch_prefix}{sprint_number}-{sprint_goal_slug}
  </steps>

  <extract>
    sprint_branch: "{git_sprint_branch_prefix}{sprint_number}-{sprint_goal_slug}"
  </extract>
</invoke-protocol>

<note>Store sprint_branch value</note>
</step>

<step n="6" goal="Report sprint ready status">
<action>Communicate in {communication_language} with {user_name}</action>

<report>
# Sprint {sprint_number} Started! 🚀

**Sprint Details:**

- **Sprint Goal:** {sprint_goal}
- **Sprint Branch:** {sprint_branch}
- **Tickets in Sprint:** {sprint_tickets.length}

**Git Branch Created:**

```
{sprint_branch}
```

## Next Steps

1. **Pick Top Ticket**: Select highest priority ticket from Sprint Backlog
2. **Create Feature Branch**:
   ```bash
   git checkout {sprint_branch}
   git checkout -b feature/{{ticket_key}}-description
   ```
3. **Development Cycle**:
   - Implement following Developer Implementation checklist
   - Code Review (move to Review status)
   - QA Validation (move to QA status)
   - Merge to `{sprint_branch}` (never to main)

**Important**: All feature branches merge to `{sprint_branch}`, NOT to `{git_main_branch}` during active sprint.

Ready to start development! 🎯
</report>
</step>

</workflow>
