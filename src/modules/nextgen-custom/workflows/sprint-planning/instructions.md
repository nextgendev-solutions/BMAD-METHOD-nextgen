<workflow>

# Sprint Planning Workflow Instructions

**Workflow Version:** 1.0.0
**Purpose:** Orchestrate comprehensive sprint planning with all workflow agents in Party-Mode

---

<!-- CRITICAL: Communication Language -->

This workflow orchestrates multi-agent sprint planning. When providing updates:

- Use clear, structured markdown output
- Format ticket lists with checkboxes and metadata
- Display progress indicators for multi-ticket processing
- Use templates defined in workflow for consistency
- Confirm each major checkpoint (ticket completion, sprint creation)
- Present actionable summaries at end of each step

---

## Recovery Protocol (Execute FIRST if state file exists)

<check if="state_file_exists">
  <action>Load state file from .bmad/state/sprint-planning-*.json</action>
  <action>Extract: sprint_number, selected_tickets, completed_tickets, current_ticket_index</action>

### Verify Completed Work in Jira

  <for-each ticket in completed_tickets>
    <action>
**BMad-Master delegates to jira-manager**: Verify ticket has checklist

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: getJiraIssue
**Parameters**: cloudId: "{jira_cloud_id}", issueIdOrKey: "{ticket}"
**Expected Return**: Ticket description for verification
</action>
<check if="description contains '## Developer Implementation Checklist'">
<action>Mark {ticket} as verified</action>
</check>
<check if="description does NOT contain checklists">
<action>Move {ticket} back to selected_tickets queue</action>
<action>Remove from completed_tickets</action>
</check>
</for-each>

### Prompt User for Confirmation

  <ask>
Found interrupted sprint planning session:
- Sprint: {sprint_number}
- Total tickets: {{selected_tickets.length}}
- Completed: {{completed_tickets.length}}
- Next ticket: {{selected_tickets[current_ticket_index]}}

Resume from checkpoint? (yes/no)
</ask>

  <check if="user_response == 'yes'">
    <goto step="2"/>  <!-- Skip Phase 1, resume from Phase 2 -->
  </check>

  <check if="user_response == 'no'">
    <action>Delete state file</action>
    <action>Continue with Step 1 (fresh start)</action>
  </check>
</check>

---

<step id="1" name="Sprint Initialization">

<!-- Communication: Step 1 Entry -->
<action>
Display to user:
"🚀 **Starting Sprint {sprint_number} Planning**

**This step will:**

1. Fetch Ready-for-Sprint tickets from Jira
2. Analyze dependencies and blockers
3. Present tickets for selection
4. Get user account info for assignment

**Let's begin...**"
</action>

<action>Display to user: "🚀 Starting Sprint {sprint_number} Planning..."</action>

### 1.1: Get Ready-for-Sprint Tickets

<action>
**BMad-Master delegates to jira-manager**: Fetch Ready-for-Sprint tickets

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: searchJiraIssuesUsingJql

**Parameters**:

- cloudId: "{jira_cloud_id}"
- jql: "project={jira_project_key} AND labels='Ready-for-Sprint' AND status IN ('To Do', 'Backlog') ORDER BY Rank ASC"
- maxResults: 20

**Expected Return**: Array of ticket objects with keys, summaries, labels, priorities, story points

Store results in: {available_tickets}
</action>

### 1.2: Check Issue Links for Dependency Ordering ⚠️

<action>
**Check Jira issue links to determine correct work order**

Before presenting tickets to user, analyze dependencies to show which tickets must be completed first.

**Method**: Query Jira issue links via REST API for each Ready-for-Sprint ticket

```bash
# Check issue links for each ticket
for ticket in {available_tickets}; do
  curl -s "https://nextgendevsolutions.atlassian.net/rest/api/3/issue/${ticket}?fields=issuelinks" \
    -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" | jq '.fields.issuelinks'
done
```

**Parse Response**:

- **`inwardIssue`**: This ticket **is blocked by** the inward issue (BLOCKER)
- **`outwardIssue`**: This ticket **blocks** the outward issue (BLOCKING)

**Categorize Tickets**:

1. **No Blockers** (can start immediately): Tickets with no `inwardIssue`
2. **Has Blockers** (wait for dependencies): Tickets with `inwardIssue`

**Store Results**:

- {tickets_with_no_blockers} - Can start sprint immediately
- {tickets_with_blockers} - Map: {ticket: [blocker1, blocker2, ...]}
- {dependency_graph} - Full dependency chain

**Example Dependency Analysis**:

```
ESNG-73 (no blockers) → Start first ✅
ESNG-74 (blocked by ESNG-73) → Add after ESNG-73
ESNG-75 (blocked by ESNG-74) → Add after ESNG-74
ESNG-16 (blocked by ESNG-73) → Add after ESNG-73
ESNG-20 (blocked by ESNG-73, ESNG-74, ESNG-75) → Add last
```

**Correct Sprint Order**: ESNG-73 → ESNG-74 → ESNG-16 → ESNG-75 → ESNG-20
</action>

### 1.3: Present Tickets to User (With Dependency Info)

<template-output section="available_tickets">
## Ready-for-Sprint Tickets ({{available_tickets.length}} found)

### ✅ No Blockers (Can Start Immediately)

{{#each tickets_with_no_blockers}}
{{@index}}. **{{this.key}}**: {{this.summary}}

- Labels: {{this.labels.join(', ')}}
- Priority: {{this.priority}}
- Story Points: {{this.storyPoints || 'Not set'}}
- **Dependencies**: None - Ready to start ✅
  {{/each}}

### ⚠️ Has Blockers (Requires Dependencies First)

{{#each tickets_with_blockers}}
{{@index}}. **{{this.key}}**: {{this.summary}}

- Labels: {{this.labels.join(', ')}}
- Priority: {{this.priority}}
- Story Points: {{this.storyPoints || 'Not set'}}
- **Blocked By**: {{this.blockers.join(', ')}} ⚠️
  {{/each}}

**Historical Velocity:** ~25 SP/sprint
**Recommended Capacity:** 6-8 tickets (≈25 SP)

**⚠️ Sprint Planning Rule**:

1. Start with tickets that have NO blockers
2. Then add tickets whose blockers are already in the sprint
3. NEVER add a ticket if its blocker is NOT in the sprint

**Select tickets for Sprint {sprint_number}:**
Enter comma-separated numbers (e.g., 1,2,3,4,5):
</template-output>

<ask>Enter ticket numbers (comma-separated):</ask>

<action>Parse user input → Store selected indices</action>
<action>Map indices to ticket IDs → Store in {selected_tickets}</action>

### 1.4: Get User Account Info

<action>
**BMad-Master delegates to jira-manager**: Fetch current user account info

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: atlassianUserInfo

**Expected Return**: User account ID and display name

Store: {user_account_id}, {user_display_name}
</action>

<note>Save state: sprint_number, selected_tickets, user_account_id</note>

</step>

---

<step id="2" name="Process Each Ticket">

<!-- Communication: Step 2 Entry -->
<action>
Display to user:
"📋 **Processing Selected Tickets**

**This step will (for each ticket):**

1. Load story context from Jira and Confluence
2. Generate Developer Implementation Checklist (with codebase search)
3. Generate Code Review Checklist
4. Generate QA Validation Checklist
5. Generate Gherkin Acceptance Criteria
6. Add checklists to Jira as Action Items
7. Add design assets (UI stories only)
8. Set metadata (story points, dependencies, assignee)

**Processing {{selected_tickets.length}} tickets...**"
</action>

<for-each ticket in selected_tickets>

<action>Set {current_ticket_index} = {{@index}}</action>
<action>Set {current_ticket} = {ticket}</action>

## <template-output section="ticket_progress">

### Processing Ticket {{@index + 1}}/{{selected_tickets.length}}: {current_ticket}

</template-output>

### 2.1: Load Story Context

<action>
**BMad-Master delegates to jira-manager**: Fetch full ticket details

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: getJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"

**Expected Return**: Complete ticket object with summary, description, labels, priority

Store: {ticket_summary}, {ticket_description}, {ticket_labels}, {ticket_priority}
</action>

<check if="ticket_description contains Confluence links">
  <action>Parse Confluence page IDs from description</action>
  <for-each page_id in confluence_page_ids>
    <action>
**BMad-Master delegates to confluence-manager**: Fetch Confluence page

**Agent**: confluence-manager (BMad built-in)

**Operation**: getConfluencePage

**Parameters**:

- cloudId: "{jira_cloud_id}"
- pageId: "{page_id}"

**Expected Return**: Page content in Markdown format

Store in: {confluence_docs}
</action>
</for-each>
</check>

### 2.2: Generate Developer Implementation Checklist

<action>Determine developer agent: IF "BE" in labels → spring-webflux-dev, ELSE → kmp-flow-dev</action>

<invoke-task agent="{developer_agent}">
**Task:** Generate Developer Implementation Checklist for {current_ticket}

**CRITICAL: Before generating checklist, EXAMINE EXISTING CODEBASE**

**Story Details:**

- Summary: {ticket_summary}
- Description: {ticket_description}
- Labels: {{ticket_labels.join(', ')}}
- Confluence Docs: {{#if confluence_docs}}Available{else}None{{/if}}

**Standards to Load:**

- docs/architecture/clean-code-principles.md
- docs/architecture/coding-standards.md (includes Codebase Search Scope section - MANDATORY)
- docs/architecture/{{#if BE}}be-coding-standards.md{else}kmp-coding-standards.md{{/if}}
- docs/qa/testing-standards.md

**STEP 1: Examine src/ Directory (MANDATORY)**

**Module-Specific Search Scope** (from coding-standards.md):

1. **Determine target module from labels**:
   - "BE" label → services module
   - "Shared"/"Platform" label → shared module
   - "UI" label → composeApp module

2. **Execute module-specific search**:
   - **composeApp**: Search composeApp → shared → services
   - **shared**: Search shared → services
   - **services**: Search services only

3. **Search for**:
   - Extract feature keywords from {ticket_summary} (e.g., "Email Validation" → "Email", "Validator")
   - `Glob: {module}/src/**/*{FeatureName}*.kt`
   - `Grep: {FeatureName} in {module}/src/`
   - Look for: Similar features, reusable components, existing patterns

4. **Document findings**:

   ```
   Codebase Search Results:
   ✅ Found: {module}/src/{path}/{ComponentName}.kt
   → Can reuse: Yes/No
   → Pattern to follow: {description}

   OR

   No existing implementation found
   → Building from scratch
   → Will follow patterns from similar features (if any)
   ```

**STEP 2: Generate Checklist (BASED ON CODEBASE FINDINGS)**

**Output Required:**
Generate 10-15 checklist items covering:

1. **FIRST ITEM MUST BE**: "Review existing {ComponentName} in {module}/src/{path} for reusable patterns" (if found)
2. File creation with exact paths (or import statements for reuse)
3. Component implementation steps (referencing existing patterns found)
4. Test creation (Kotest FreeSpec)
5. Coverage verification (./gradlew koverVerify)
6. KDoc documentation

**Checklist Format Examples:**

**If existing code found:**

```markdown
- [ ] Review existing EmailValidator in shared/src/util/validators/EmailValidator.kt
- [ ] Import EmailValidator and extend for new use case
- [ ] Add new validation rule to EmailValidator (follow existing pattern)
      ...
```

**If no existing code found:**

```markdown
- [ ] Search for similar validation patterns in shared/src/util/
- [ ] Create EmailValidator.kt in shared/src/util/validators/ (new file)
- [ ] Implement validation logic following existing utility patterns
      ...
```

Return as markdown list (- [ ] format).
</invoke-task>

<action>Store result in {dev_checklist}</action>

### 2.3: Generate Code Review Checklist

<invoke-task agent="code-reviewer">
**Task:** Generate Code Review Checklist for {current_ticket}

**Story Details:**

- Summary: {ticket_summary}
- Labels: {{ticket_labels.join(', ')}}

**Standards to Load:**

- docs/architecture/clean-code-principles.md
- docs/architecture/coding-standards.md
- docs/qa/testing-standards.md

**Output Required:**
Generate 7-10 checklist items covering:

1. ❌ CRITICAL violations (suspend in interfaces, blocking calls, module placement, hardcoded colors)
2. Test framework compliance (Kotest FreeSpec)
3. Coverage thresholds
4. Reactive patterns (Flow/StateFlow for KMP, Mono/Flux for BE)
5. Accessibility compliance

Return as markdown list (- [ ] format).
</invoke-task>

<action>Store result in {review_checklist}</action>

### 2.4: Generate QA Validation Checklist

<invoke-task agent="qa">
**Task:** Generate QA Validation Checklist for {current_ticket}

**Story Details:**

- Summary: {ticket_summary}
- Description: {ticket_description}
- Labels: {{ticket_labels.join(', ')}}

**Standards to Load:**

- docs/qa/testing-standards.md
- docs/design/design-system.md (if UI story)
- docs/design/wireframes.md (if UI story)

**Output Required:**
Generate 8-12 checklist items covering:

1. Test execution (./gradlew test passes)
2. Coverage verification (./gradlew koverVerify passes)
3. All acceptance criteria validated
4. UI rendering matches wireframe (if UI)
5. Design compliance (Material3 tokens)
6. Accessibility testing
7. Build verification (./gradlew build succeeds)

Return as markdown list (- [ ] format).
</invoke-task>

<action>Store result in {qa_checklist}</action>

### 2.4.1: Generate Gherkin Acceptance Criteria

<invoke-task agent="qa">
**Task:** Generate Gherkin Acceptance Criteria for {current_ticket}

**Story Details:**

- Summary: {ticket_summary}
- Description: {ticket_description}
- Labels: {{ticket_labels.join(', ')}}
- Existing ACs: {ticket_description} (extract any existing acceptance criteria)

**Standards to Load:**

- docs/qa/testing-standards.md
- docs/architecture/clean-code-principles.md
- docs/architecture/coding-standards.md

**Output Required:**
Generate 3-5 Gherkin scenarios in Given/When/Then format covering:

1. Primary success scenarios (happy path)
2. Edge cases and boundary conditions
3. Error conditions and validation failures
4. Integration points with other modules
5. Cross-platform compatibility (if KMP story)

**Gherkin Format**:

```gherkin
Scenario: [Clear, specific scenario name]
Given [Precondition - system state]
When [Action - what the user/system does]
Then [Expected outcome - observable result]
And [Additional assertion - if needed]
```

**Quality Requirements**:

- Each scenario must be testable and automatable
- Use specific, concrete conditions (avoid vague terms)
- Include both technical and business acceptance criteria
- Reference actual file paths, module names, commands where applicable
- Align with project architecture (reactive patterns, KMP structure)

Return as Gherkin syntax in code block format.
</invoke-task>

<action>Store result in {gherkin_scenarios}</action>

<action>
**Add Gherkin ACs to Jira Description**

**BMad-Master delegates to jira-manager**: Add Gherkin section to Jira description

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: Update Jira description with Gherkin ACs (ADF code block with syntax highlighting)

**Delegation Instruction**:
"Add Gherkin Acceptance Criteria section to {current_ticket} description:

1. Fetch current description ADF via REST API
2. Append new heading: 'Acceptance Criteria (Gherkin)'
3. Add code block with language='gherkin' containing scenarios
4. PUT updated ADF back to ticket
5. Verify Gherkin section appears in Jira UI with proper syntax highlighting"

**Pass to jira-manager**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- gherkin_scenarios: {gherkin_scenarios}

**Expected Return**: Success confirmation

**ADF Structure**:

```json
{
  "type": "heading",
  "attrs": {"level": 2},
  "content": [{"type": "text", "text": "Acceptance Criteria (Gherkin)"}]
},
{
  "type": "codeBlock",
  "attrs": {"language": "gherkin"},
  "content": [{"type": "text", "text": "{gherkin_scenarios}"}]
}
```

</action>

<note>
Mark {current_ticket} Gherkin ACs added.
Save state: completed_tickets[current_ticket].gherkin_acs_added = true
</note>

### 2.5: Add Checklists to Jira as Action Items (IMMEDIATE SAVE)

<action>
**STEP 1: Prepare checklist data for Action Items conversion**

Convert generated checklists from Wiki format to Action Items format:

**Input Variables**:

- {dev_checklist} - List of developer tasks (currently `- [ ]` format)
- {review_checklist} - List of code review tasks
- {qa_checklist} - List of QA tasks

**Expected Structure**: Each checklist is array of text items (without `- [ ]` markers)
</action>

<action>
**STEP 2: Delegate Action Items creation to jira-manager**

**BMad-Master delegates to jira-manager**: Create Native Jira Action Items (ADF format)

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: Create Action Items using REST API v3 with ADF format (see jira-manager.md Section 2)

**Delegation Instruction**:
"Create 3 Native Jira Action Items checklists for {current_ticket}:

1. Developer Implementation Checklist (localId: dev-1, dev-2, ..., dev-N)
2. Code Review Checklist (localId: review-1, review-2, ..., review-N)
3. QA Validation Checklist (localId: qa-1, qa-2, ..., qa-N)

Use ADF format with taskList/taskItem structure. Append to existing description without replacing original content. All items should have state='TODO' initially.

**IMPORTANT - Code Examples**: If description contains code examples, use native ADF code blocks with syntax highlighting:

- Use code_block(code, language) helper function (defined in jira-manager.md)
- Set language attribute: 'kotlin', 'java', 'bash', 'json', 'yaml', etc.
- DO NOT use Wiki markup {noformat} or {{...}} - these lack syntax highlighting
- Example: code_block('fun example() { ... }', 'kotlin')"

**Pass to jira-manager**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- dev_items: {dev_checklist} (array of text items)
- review_items: {review_checklist} (array of text items)
- qa_items: {qa_checklist} (array of text items)

**Expected Return**: Success confirmation with number of items created

**Implementation Note**: jira-manager will:

1. Fetch current description ADF via REST API
2. Parse existing content array
3. Add separator heading: {"type": "heading", "text": "---"}
4. Add 3 taskLists with proper localId naming (dev-1, review-1, qa-1, etc.)
5. PUT updated ADF back to ticket
6. Verify Action Items appear in Jira UI

**Fallback**: If ticket has mixed format (legacy Wiki + new Action Items), jira-manager handles gracefully
</action>

<note>
Mark {current_ticket} checklists added.
Save state: completed_tickets[current_ticket] = {checklists_added: true}
</note>

### 2.6: Add Design Assets (UI Stories Only)

<check if="'UI' in ticket_labels">
  <action>Read docs/design/wireframes.md → Find section for {current_ticket}</action>
  <action>Identify prototype HTML file in docs/design/prototypes/</action>

  <ask optional="true">
**Design Assets for {current_ticket}:**
- Wireframe: Found at lines {wireframe_lines}
- Prototype: {prototype_file}

Do you want me to take a screenshot and attach it to Jira? (yes/no/skip)
</ask>

  <check if="user_response == 'yes'">
    <action>Use browser MCP to open {prototype_file}</action>
    <action>Take screenshot → Save to /tmp/{current_ticket}-prototype.png</action>
    <action>
Upload screenshot via Jira REST API:

```bash
curl -X POST \
  "https://nextgendevsolutions.atlassian.net/rest/api/3/issue/{current_ticket}/attachments" \
  -H "Authorization: Bearer {token}" \
  -H "X-Atlassian-Token: no-check" \
  -F "file=@/tmp/{current_ticket}-prototype.png"
```

    </action>

    <action>

**BMad-Master delegates to jira-manager**: Add design asset comment

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: addCommentToJiraIssue
**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- commentBody:

```
🎨 Design Assets Available:
- Screenshot: See attached prototype screenshot
- Wireframe: /docs/design/wireframes.md (Lines {wireframe_lines})
- Prototype: {prototype_file}
- Design System: /docs/design/design-system.md
- Complete reference: /docs/design/DESIGN-ASSETS-REFERENCE.md
```

    </action>

    <note>

Mark {current_ticket} design assets attached.
Save state: completed_tickets[current_ticket].design_assets_attached = true
</note>
</check>
</check>

### 2.7: Set Metadata (Auto-Read Story Points & Dependencies)

#### Step 1: Auto-Read Story Points (Issue-Type Aware)

<action>
**Determine issue type from ticket data (already fetched in Step 2.1)**

Extract {issue_type} from ticket (e.g., "Bug", "Story", "Task", "Epic").
</action>

<check if="issue_type == 'Bug'">
  <action>
  **Bugs do not require story points** (Jira field limitation for Bug type)

Set {story_points} = "N/A (Bug)"
Log: "✅ {current_ticket} is a Bug - story points not applicable"

**Do NOT count toward total_story_points**
</action>
</check>

<check if="issue_type != 'Bug'">
  <action>
  **Auto-read story points from Jira ticket (customfield_10016)**

Story points should already be set during backlog refinement by dev team.

Extract from ticket data fetched in Step 2.1:

- Field: customfield_10016 (or storyPoints property)

IF story_points is missing/null: - {story_points} = 0 - Log warning: "⚠️ {current_ticket} missing story points - dev will set during implementation"
ELSE: - {story_points} = value from Jira - Log: "✅ {current_ticket} story points: {story_points} SP (from Jira)"

Add {story_points} to {total_story_points}
</action>
</check>

#### Step 2: Auto-Read Dependencies from Issue Links

<action>
**Dependencies are set during backlog refinement as Jira issue links**

**Query issue links via Jira API:**

```bash
curl -s "https://api.atlassian.com/ex/jira/{jira_cloud_id}/rest/api/3/issue/{current_ticket}?fields=issuelinks" \
  -u "${ATLASSIAN_USERNAME}:${ATLASSIAN_API_TOKEN}"
```

**Parse response:**

- `fields.issuelinks[].inwardIssue.key` = Tickets that BLOCK this ticket (dependencies)
- `fields.issuelinks[].outwardIssue.key` = Tickets this ticket BLOCKS

**Extract blockers (dependencies):**
{dependency_keys} = array of all inwardIssue.key values

IF no dependencies found:

- {dependency_keys} = [] (empty array)
- Log: "✅ {current_ticket} has no blockers"
  ELSE:
- Log: "✅ {current_ticket} blocked by: {{dependency_keys.join(', ')}}"

**IMPORTANT:**

- Dependencies already exist in Jira from backlog refinement
- No need to create new issue links
- Just read and store for summary display
  </action>

#### Step 3: Assign to User (Keep Existing)

<action>
**BMad-Master delegates to jira-manager**: Assign ticket to user

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: editJiraIssue
**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- fields: { assignee: { accountId: "{user_account_id}" } }
  </action>

<note>
Mark {current_ticket} fully prepared.
Save state:
  completed_tickets[current_ticket].issue_type = {issue_type}
  completed_tickets[current_ticket].story_points = {story_points}
  completed_tickets[current_ticket].dependencies = {dependency_keys}
  completed_tickets[current_ticket].assignee = {user_account_id}

IF {issue_type} != "Bug":
Update: total_story_points += {story_points}

Note: Story points and dependencies auto-read from Jira. No user input required.
</note>

<template-output section="ticket_complete">
✅ **{current_ticket}** prepared successfully!
- Type: {issue_type}
- Checklists: ✅ (Dev, Review, QA)
- Design assets: {{#if design_assets_attached}}✅{else}N/A{{/if}}
- Story points: {{#if issue_type == 'Bug'}}N/A (Bug){else}{story_points} SP{{/if}}
- Dependencies: {{#if dependency_keys.length > 0}}{{dependency_keys.join(', ')}}{else}None{{/if}}
- Assigned to: {user_display_name}

**Progress:** {{@index + 1}}/{{selected_tickets.length}} tickets complete
</template-output>

</for-each>

<note>All tickets processed. Save final state before Phase 3.</note>

</step>

---

<step id="3" name="Create Sprint and Add Issues">

<!-- Communication: Step 3 Entry -->
<action>
Display to user:
"🎯 **Creating Sprint in Jira**

**This step will:**

1. Prompt for sprint goal
2. Calculate sprint duration (2 days)
3. Delegate sprint creation to jira-manager
4. Add all tickets to sprint
5. Rank tickets by priority
6. Verify sprint creation

**Ready to create Sprint {sprint_number}...**"
</action>

<ask>
All {{selected_tickets.length}} tickets prepared ({total_story_points} SP total).

**Sprint Goal:** (Enter sprint goal description):
</ask>

<action>Store {sprint_goal} from user input</action>

### 3.1: Calculate Sprint Duration

<action>
Calculate sprint dates:
- Start Date: {current_date} (ISO format: YYYY-MM-DDTHH:MM:SS.000Z)
- End Date: {{current_date + 2 days}} (Default: 2-day sprint, can close early)
- End Time: 23:59:59.999Z
</action>

### 3.2: Delegate Sprint Creation to jira-manager

<action>
🚨 **AUTOMATED SPRINT CREATION** (via jira-manager sub-agent)

**BMad-Master delegates to jira-manager**: Create Sprint {sprint_number} in Jira

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: Create sprint using MCP (primary) with REST API fallback

**Delegation Instruction**:
"Create Sprint {sprint_number} in Jira board 100:

1. Try MCP tool first: mcp**MCP_DOCKER**jira_create_sprint
2. If MCP fails → Use REST API fallback
3. Capture sprint ID from response
4. Add all {{selected_tickets.length}} tickets to sprint
5. Rank tickets by priority (CRITICAL → Hotfix → Dependencies → UI)
6. Verify sprint creation and ticket assignment
7. Report back with sprint ID and URL"

**Pass to jira-manager**:

- board_id: "{jira_board_id}"
- sprint_name: "Sprint {sprint_number}"
- start_date: "{start_date_iso}"
- end_date: "{end_date_iso}" (2-day duration)
- goal: "{sprint_goal}"
- tickets: {selected_tickets} (array of ticket keys)

**Ranking Algorithm** (jira-manager must follow):

1. CRITICAL/Hotfix tickets FIRST (highest priority)
2. Independent tickets (no dependencies)
3. Foundation tickets (blocks others, like OAuth before deep links)
4. Dependent tickets (in dependency order)
5. UI fixes LAST (lowest priority)

**Expected Return**:

```json
{
  "operation": "createSprintAndAddTickets",
  "status": "success",
  "verified": true,
  "details": {
    "sprint": {
      "id": 133,
      "name": "Sprint {sprint_number}",
      "state": "future",
      "goal": "{sprint_goal}",
      "startDate": "...",
      "endDate": "...",
      "originBoardId": 100
    },
    "tickets": {
      "total": {{selected_tickets.length}},
      "expectedStoryPoints": {total_story_points},
      "issueKeys": {selected_tickets}
    },
    "ranking": {
      "order": ["ESNG-XX", "ESNG-YY", ...],
      "verified": true
    },
    "method": "mcp|rest-api"
  }
}
```

**Fallback Strategy**: If MCP fails, jira-manager uses REST API:

```bash
# Create sprint
curl -X POST "${ATLASSIAN_URL}rest/agile/1.0/sprint" \
  -u "${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sprint {sprint_number}",
    "goal": "{sprint_goal}",
    "startDate": "{start_date_iso}",
    "endDate": "{end_date_iso}",
    "originBoardId": 100
  }'

# Add tickets and rank them (see jira-manager implementation)
```

</action>

<action>
Store from jira-manager response:
- {sprint_id}
- {sprint_url}
- {sprint_state}
</action>

<check if="jira_manager_response.status != 'success'">
  <action>
  🚨 **SPRINT CREATION FAILED**

Error: {{jira_manager_response.error}}

STOP: Cannot proceed without sprint creation. Review error and retry.
</action>
</check>

<note>Sprint created. Save state: sprint_created = true, sprint_id = {sprint_id}</note>

</step>

---

<step id="4" name="Sprint Kickoff Summary">

<!-- Communication: Step 4 Entry -->
<action>
Display to user:
"✅ **Sprint Planning Complete - Generating Summary**

**This step will:**

1. Display all prepared tickets with metadata
2. Show sprint summary (ID, URL, story points, goal)
3. List next steps for sprint execution
4. Optionally trigger /start-sprint workflow

**Preparing final report...**"
</action>

<template-output section="final_summary">
# Sprint {sprint_number} Planning Complete! 🚀

## Tickets Prepared: {{selected_tickets.length}}

{{#each selected_tickets}}

### {{@index + 1}}. [{this}: {{completed_tickets[this].summary}}](https://nextgendevsolutions.atlassian.net/browse/{this})

- **Labels:** {{completed_tickets[this].labels.join(', ')}}
- **Story Points:** {{completed_tickets[this].story_points}}
- **Checklists:**
  - Developer Implementation: ✅
  - Code Review: ✅
  - QA Validation: ✅
- **Design Assets:** {{#if completed_tickets[this].design_assets_attached}}✅ Attached{else}N/A{{/if}}
- **Dependencies:** {{#if completed_tickets[this].dependencies}}{{completed_tickets[this].dependencies.join(', ')}}{else}None{{/if}}
- **Assigned to:** {user_display_name}

{{/each}}

---

## Sprint Summary

- **Sprint ID:** {sprint_id}
- **Sprint URL:** {sprint_url}
- **Total Story Points:** {total_story_points} SP
- **Sprint Goal:** {sprint_goal}
- **Duration:** 2 days ({start_date} - {end_date})
- **State:** {sprint_state} (ready to start)

## Ready to Start! 🎯

All tickets have:

- ✅ Comprehensive checklists (Dev, Code Review, QA)
- ✅ Design assets attached (for UI stories)
- ✅ Story points assigned
- ✅ Dependencies marked
- ✅ Assigned to {user_display_name}
- ✅ Added to Sprint {sprint_number} (ID: {sprint_id})
- ✅ Ranked by priority (CRITICAL → Hotfix → Dependencies → UI)

## Next Steps

1. **View Sprint:** {sprint_url}
2. **Start Sprint in Jira:** Click "Start Sprint" button (sprint is currently in "future" state)
3. **Create Sprint Branch:** `sprint/{sprint_number}-{sprint_goal_slug}`
4. **Pick Top Ticket** from Sprint Backlog (follows ranking order)
5. **Create Feature Branch:** `feature/{ticket_key}-description`
6. **Implement** following Developer Implementation checklist
7. **Code Review** → **QA** → **Merge** to sprint branch

---

**Start sprint now?** (Enter "yes" to proceed with /start-sprint workflow)
</template-output>

<ask>Start sprint now? (yes/no):</ask>

<check if="user_response == 'yes'">
  <invoke-workflow path="bmad/workflows/start-sprint/workflow.yaml">
    <param name="sprint_number">{sprint_number}</param>
  </invoke-workflow>
</check>

<note>Workflow complete. Delete state file (success).</note>

</step>

---

## Completion

<action>Display success message</action>
<action>Delete state file from .bmad/state/</action>
<action>Report back to BMad Master: Workflow complete, {{selected_tickets.length}} tickets prepared</action>

</workflow>
