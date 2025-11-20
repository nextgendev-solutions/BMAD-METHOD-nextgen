<?xml version="1.0" encoding="UTF-8"?>
<workflow name="create-jira" version="1.0.0">

# Create Jira Issue Workflow - Instructions

**Version**: 1.0.0
**Workflow**: Unified Bug/Task/Story creation with intelligent Backlog vs Sprint routing

---

## Overview

This workflow consolidates create-bug and create-hotfix into a single flexible workflow that:

1. Captures comprehensive issue details (core prompts plus type-specific follow-ups)
2. Determines routing based on urgency (2 routing questions)
3. Creates Jira ticket with all context
4. Routes to Backlog (non-urgent) or Current Sprint (urgent)
5. Positions in sprint based on immediate start flag

---

<step n="1" goal="Issue Discovery &amp; Documentation">
<communication action="inform">Gathering comprehensive issue details including title, type, platform, priority, and routing decisions</communication>

## Phase 1: Issue Discovery & Documentation

<action>
**BMad Master asks KA interactively (core prompts plus type-specific questions):**

### Core Issue Details

1. **Issue Title**: What's the issue in one sentence?
   - Variable: `issue_title`

2. **Issue Type**: Is this a Bug, Task, or Story?
   - Variable: `issue_type`
   - Options: Bug, Task, Story
   - Default: Bug

<check if="issue_type == 'Bug'">

3. **What Happened** (Observed Behavior): What did you observe?
   - Variable: `bug_observed`
   - Capture actual behavior currently occurring

4. **What Should Happen** (Expected Behavior): What did you expect?
   - Variable: `bug_expected`
   - Capture desired behavior once resolved

</check>

<check if="issue_type != 'Bug'">

3. **Desired Outcome**: What outcome should this task/story deliver?
   - Variable: `task_story_outcome`
   - Describe the functional or experiential result

4. **Value / Rationale**: Why does this outcome matter?
   - Variable: `task_story_value`
   - Connect to user or business value

</check>

5. **Location in App**: Where in the app did this occur?
   - Variable: `location_in_app`
   - Examples: "Login Screen", "Profile Setup", "API Gateway /auth endpoint"

6. **Platform**: Which platform is affected?
   - Variable: `platform`
   - Options: iOS, Android, Web, Backend, Shared
   - Sets Jira label automatically

7. **Priority**: How critical is this?
   - Variable: `priority`
   - Options: Critical, High, Medium, Low
   - Default: Medium

8. **Impact**: What's the user/business impact?
   - Variable: `impact`
   - Examples: "Users can't login", "Data loss risk", "Poor UX"

9. **Device/Environment**: Device, browser, or environment info (optional)
   - Variable: `device_info`
   - Examples: "iPhone 15 Pro, iOS 17.5", "Chrome 120, macOS", "Production backend"

10. **Screenshots**: Do you have screenshots to attach?
    - Variable: `screenshots_attached`
    - Boolean: true/false

11. **Logs**: Do you have logs to attach?
    - Variable: `logs_attached`
    - Boolean: true/false

12. **Additional Labels**: Any extra Jira labels to add (comma separated)?
    - Variable: `additional_labels_raw`
    - BMad Master trims, deduplicates, and stores normalized results in `extra_labels`

### Routing Questions (2 questions)

13. **Urgency**: Is this urgent? Should it be added to the current sprint instead of backlog?
    - Variable: `is_urgent`
    - Boolean: true/false
    - **Impact**: Routes to Backlog (false) or Current Sprint (true)

14. **Immediate Start** (only if is_urgent=true): Start implementation immediately? - Variable: `start_immediately` - Boolean: true/false - **Impact**: Positions Top (true) or Bottom (false) in sprint
    </action>

</step>

<step n="2" goal="Acceptance Criteria Discovery &amp; Approval">
<communication action="inform">Drafting and iterating on structured acceptance criteria for the issue</communication>

## Phase 1.5: Acceptance Criteria Discovery & Approval

<action>
**BMad Master drafts structured acceptance criteria:**

1. Generate an initial list of Gherkin-style bullets (`Given/When/Then`) derived from captured context. If no acceptance criteria appear necessary, state the rationale and ask KA to confirm skipping.
2. Present the proposed bullets to KA for review, allowing additions, edits, or deletions. Continue iterating until KA confirms the final list or explicitly approves skipping.
3. Once confirmed, store the final, ordered list (which may be empty) as `acceptance_criteria`. Each bullet MUST follow the format `- Given ..., When ..., Then ...`.
4. Summarize the approved outcome back to KA before continuing.
   </action>

</step>

<step n="3" goal="Create Jira Ticket">
<communication action="inform">Creating Jira ticket with all collected details and structured description</communication>

## Phase 2: Create Jira Ticket

<action>
**Jira Manager creates ticket** using `mcp__MCP_DOCKER__jira_create_issue`:

```javascript
{
  project_key: "ESNG",
  summary: {issue_title},
  issue_type: {issue_type},  // Dynamic: Bug, Task, or Story
  description: `
## Summary
{issue_title}

{issue_type == "Bug"
  ? `## What Happened (Observed)
${bug_observed}

## What Should Happen (Expected)
${bug_expected}`
  : `## Desired Outcome
${task_story_outcome}

## Value / Rationale
${task_story_value}` }

## Location
{location_in_app}

## Platform
{platform}

## Impact
{impact}

## Environment/Device
{device_info}

## Attachments
- Screenshots: {screenshots_attached ? "Yes - see attachments" : "No"}
- Logs: {logs_attached ? "Yes - see attachments" : "No"}

## Next Steps
{is_urgent ? "Added to current sprint - " + (start_immediately ? "prioritized for immediate start" : "positioned for later pickup") : "Added to backlog for sprint planning"}

## Acceptance Criteria
{acceptance_criteria && acceptance_criteria.trim().length > 0
  ? acceptance_criteria
  : "No acceptance criteria required (confirmed with KA)"}
`,
  additional_fields: {
    priority: {name: {priority}},
    labels: [{platform}, ...(extra_labels || [])]  // Combine platform label with optional extras
  }
}
```

**Output**: Returns created issue key (e.g., ESNG-123)
</action>

</step>

<step n="4" goal="Create Standard Checklists">
<communication action="inform">Adding Developer Implementation, Code Review, and QA Validation checklists to ticket</communication>

## Phase 2.5: Create Standard Checklists

<action>
**Jira Manager creates 3 standard checklists** on newly created ticket using Jira REST API:

**CRITICAL**: MCP Atlassian server CANNOT create checklists. MUST use Jira REST API directly via curl.

**Checklists to create:**

1. **Developer Implementation Checklist**
   - Search existing code for similar patterns
   - Load design assets (UI stories only)
   - Implement feature following coding standards
   - Write tests (Kotest FreeSpec)
   - Verify coverage thresholds (60% composeApp, 80% shared/services)
   - Capture runtime evidence (logs + screenshots/API responses)
   - Attach evidence to Jira ticket
   - Mark all checklist items complete

2. **Code Review Checklist**
   - Verify DI patterns (Spring for BE, Koin for KMP)
   - Check code reuse (no duplicate code)
   - Verify consistency with existing patterns
   - Check architecture compliance (module placement, reactive patterns, UI standards)
   - Verify design compliance (UI stories)
   - Mark all checklist items complete

3. **QA Validation Checklist**
   - Verify runtime evidence present
   - Execute independent testing
   - Compare implementation vs design specs
   - Validate all acceptance criteria met
   - Verify build succeeds
   - Mark all checklist items complete

**Method**: Use curl with Jira REST API. Reference `docs/workflows/checklist-enforcement.md` for API endpoints and checklist item structure.

**Validation**: After creation, verify all 3 checklists exist on ticket. If creation fails, report error to KA and ABORT workflow.
</action>

</step>

<step n="5" goal="Route to Backlog or Sprint">
<communication action="inform">Routing ticket to Backlog or Current Sprint based on urgency and positioning for pickup</communication>

## Phase 3: Route to Backlog or Sprint

<check if="is_urgent == false">

### Route: BACKLOG FLOW

<action>
**Ticket goes to Backlog** for future sprint planning:

1. **No additional routing** required
2. Ticket stays in Backlog status
3. Will be picked up during sprint planning
4. Report to KA: "✅ Ticket {issue_key} created and added to Backlog"
   </action>

</check>

<check if="is_urgent == true">

### Route: SPRINT FLOW

<action>
**Jira Manager adds to Current Sprint:**

1. **Get Active Sprint**:

   ```javascript
   mcp__MCP_DOCKER__jira_get_sprints_from_board(
     board_id: "100",  // ESNG board
     state: "active"
   )
   ```

2. **Add Issue to Sprint**:

   ```javascript
   mcp__MCP_DOCKER__jira_update_issue(
     issue_key: {created_issue_key},
     fields: {
       sprint: {active_sprint_id}
     }
   )
   ```

3. **Position in Sprint**:
   - If `start_immediately == true`:
     - Position at **TOP** of sprint (Rank: highest)
     - Report: "🔴 URGENT: Positioned at top of sprint for immediate pickup"

   - If `start_immediately == false`:
     - Position at **BOTTOM** of sprint (Rank: lowest)
     - Report: "⚠️ Added to current sprint but positioned for later work"

4. **Report to KA**:
   ```
   ✅ Ticket {issue_key} created and added to Current Sprint
   📍 Position: {start_immediately ? "TOP (immediate start)" : "BOTTOM (work later)"}
   ```
   </action>

<check if="start_immediately == true">

### Optional: Start Implementation Flow

<action>
**BMad Master asks KA**: "This ticket is marked for immediate start. Would you like to begin implementation now?"

- If **YES**:
  1. Delegate to git-manager: Create feature branch `feature/ESNG-{issue_number}-{sanitized-title}`
  2. Delegate to jira-manager: Move ticket to "In Progress"
  3. Trigger appropriate dev agent (based on {platform} label):
     - BE → spring-webflux-kotlin-dev
     - Shared/Platform/UI → kmp-flow-dev
  4. Begin story implementation cycle

- If **NO**:
  1. Report: "Ticket ready in sprint. Pick up manually when ready."
     </action>

</check>

</check>

</step>

---

## Success Criteria

Each created ticket MUST have:

- ✅ Clear title and description
- ✅ Issue type (Bug/Task/Story)
- ✅ Observed vs Expected behavior (Bugs) OR Outcome & Value (Tasks/Stories) captured
- ✅ Location, platform, and impact captured
- ✅ Platform label applied automatically plus optional extras when provided
- ✅ Priority set
- ✅ Acceptance criteria captured or explicitly skipped with KA approval
- ✅ **3 standard checklists created** (Developer Implementation, Code Review, QA Validation)
- ✅ Routed to correct location (Backlog or Sprint)
- ✅ Positioned correctly if in sprint (Top or Bottom)

---

## Example Execution

### Example 1: Urgent Bug → Sprint Top (Immediate Start)

**Input:**

- Title: "Login fails with HTTP 401 on valid credentials"
- Type: Bug
- Platform: Backend
- Priority: High
- is_urgent: true
- start_immediately: true

**Result:**

- ✅ Ticket ESNG-200 created
- 🔴 Added to current sprint at TOP
- 🚀 Feature branch created, moved to In Progress, dev agent triggered

### Example 2: Feature Story → Backlog

**Input:**

- Title: "Add fingerprint authentication"
- Type: Story
- Platform: Shared
- Priority: Medium
- is_urgent: false

**Result:**

- ✅ Ticket ESNG-201 created
- 📦 Added to Backlog for sprint planning
- ⏸️ Waits for sprint planning to be picked up

### Example 3: Urgent Task → Sprint Bottom (Work Later)

**Input:**

- Title: "Update API documentation for v2 endpoints"
- Type: Task
- Platform: Backend
- Priority: Medium
- is_urgent: true
- start_immediately: false

**Result:**

- ✅ Ticket ESNG-202 created
- ⚠️ Added to current sprint at BOTTOM
- 📌 Available for pickup later in sprint

---

## Agent Responsibilities

| Agent            | Responsibility                                          |
| ---------------- | ------------------------------------------------------- |
| **BMad Master**  | Orchestrate workflow, ask questions, coordinate routing |
| **Jira Manager** | Create ticket, add to sprint, set ranking               |
| **Git Manager**  | Create feature branch (if immediate start)              |
| **Dev Agent**    | Begin implementation (if immediate start)               |

---

**Last Updated**: 2025-10-30
**Related Workflows**: hotfix-workflow.md, sprint-planning-workflow.md

</workflow>
