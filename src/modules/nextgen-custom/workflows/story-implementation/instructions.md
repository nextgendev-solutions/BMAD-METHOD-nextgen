# Story Implementation Cycle Workflow Instructions

**Purpose:** Complete dev → code review → QA → merge cycle for single story

**State Machine:** start → dev → review → (qa OR dev) → merge → complete

<workflow name="story-implementation" version="1.0.0">

**Input Parameters** (from continue-current-sprint or direct invocation):

- `story_key`: Jira ticket ID (e.g., "ESNG-143")
- `sprint_number`: Active sprint number
- `runtime_commands`: Map of commands to run app (backend, iOS, etc.) - optional
- `bug_analysis_report`: YAML report from bug-analyzer (for Bug tickets) - optional
- `party_mode_required`: Boolean for complex stories requiring architect pairing - optional

---

## Recovery Protocol

<check if="state_file_exists">
  <action>Load state → Verify Jira status matches {current_status} → Verify {feature_branch} exists → Prompt to resume</action>

  <ask>
Found interrupted story implementation:
- Story: {story_key}
- Phase: {current_phase}
- Jira Status: {current_status}
- Iteration: {{iteration_count}}

Resume from {current_phase}? (yes/no)
</ask>

  <check if="user_response == 'yes'">
    <goto step="{{current_phase_step}}"/>  <!-- Jump to appropriate step based on current_phase -->
  </check>
</check>

---

<step n="1" goal="Start Story" phase="start">
<communication>
Inform {user_name} in {communication_language}: Starting story implementation - validating dependencies, creating feature branch, and preparing developer agent delegation
</communication>

<action>Set {current_phase} = "start"</action>

### 1.1: Extract Basic Story Metadata (Minimal Read)

<action>
**BMad-Master**: Read ONLY essential metadata for orchestration

**Purpose**: Minimal Jira read for agent assignment and state file creation

**Fields to Extract** (orchestration-level only):

- {story_key} (ticket ID)
- {{story_labels}} (for agent selection: BE/KMP, Junior/Senior)
- {{sprint_number}} (from sprint field)

**NOT FETCHED**: Description, acceptance criteria, attachments
**Reason**: Agent will fetch full details autonomously

**Storage**: Store only {story_key}, {{story_labels}}, {{sprint_number}} in memory
</action>

### 1.2: Validate Dependencies & Git Status 🚨

<action>
**BMad-Master delegates to jira-manager**: Check issue links for blockers

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: Fetch issue with issuelinks field

**REST API Call**:

```bash
curl -s "https://api.atlassian.com/ex/jira/{jira_cloud_id}/rest/api/3/issue/{story_key}?fields=issuelinks,status&expand=issuelinks.issues" \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}"
```

**Parse Response**:

- Extract `fields.issuelinks[]` array
- For each link, check:
  - `inwardIssue` with `type.inward` matching: "is blocked by", "depends on", "has to be done after"
  - `outwardIssue` with `type.outward` == "has to be done before" (REVERSE: this ticket must complete before outward)

**Store**:

- {{blocking_issues}} = array of {key, status, linkType}

**Delegation Instruction to jira-manager**:
"Fetch {story_key} with issuelinks field and expand=issuelinks.issues. Parse all issue links and identify blocking relationships:

1. inwardIssue links with types: 'is blocked by', 'depends on', 'has to be done after'
2. outwardIssue links with type: 'has to be done before' (reverse relationship)

For each blocker found:

- Extract blocker status from embedded issuelinks data (no additional API call needed)
- Return: {key, summary, status, linkType}

CRITICAL: If blocker status != 'Done', this is a BLOCKING condition."
</action>

<action>
**Validate Blocker Status** (using embedded data from Step 1.2):

Filter {{active_blockers}} = empty array

For each link in blocking_issues:

- Extract blocker from embedded issuelinks data
- Check blocker.fields.status.name (already embedded via expand=issuelinks.issues)
- If status NOT IN ['Done', 'Merged', 'QA PASS']:
  - Add to {{active_blockers}} array
  - Store: {key: blocker.key, summary: blocker.fields.summary, status: blocker.fields.status.name, linkType: link.type.name}

**Result**: {{active_blockers}} array populated WITHOUT additional API calls
</action>

<check if="active_blockers.length > 0">
  <action>
  **BMad-Master delegates to jira-manager**: Add blocked warning comment

**Operation**: addCommentToJiraIssue
**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{story_key}"
- commentBody:

```
⚠️ **Development Blocked - Dependencies Incomplete**

Cannot start {story_key} - blocked by {{active_blockers.length}} unresolved issue(s):

{{#each active_blockers}}
- [{{key}}: {{summary}}]({{url}}) - Status: {{status}} ❌ (Required: Done)
{{/each}}

**Action Required**: Complete all blockers before starting this story

Workflow stopped at dependency validation checkpoint.
```

  </action>

  <template-output section="dependency_blocked">
  ---
  ## ❌ STORY BLOCKED: {story_key}

**Cannot proceed - {{active_blockers.length}} blocking dependencies incomplete:**

{{#each active_blockers}}

- **Blocker**: [{{key}}: {{summary}}]({{url}})
- **Status**: {{status}} ❌ (Required: Done)
- **Link Type**: {{linkType}}
  {{/each}}

**Action Required:**

1. Complete all blocked issues listed above
2. Verify all blocker statuses = Done/Merged
3. Re-run story implementation for {story_key}

**Workflow Status**: STOPPED at dependency validation checkpoint

---

  </template-output>

  <action>
  🚨 **FAIL-FAST: Story has {{active_blockers.length}} active blocker(s)**
  STOP: Workflow cannot proceed
  Report to {user_name}: "Story {story_key} blocked by: {{active_blockers.map(b => b.key).join(', ')}}"
  </action>
  <action>EXIT workflow</action>
</check>

<check if="active_blockers.length == 0 AND blocking_issues.length > 0">
  <template-output section="dependencies_validated">
  ## ✅ Dependencies Validated

**Blockers Checked**: {{blocking_issues.length}}
{{#each blocking_issues}}

- {{this.key}}: {{this.status}} ✅ ({{this.linkType}})
  {{/each}}

All dependencies complete. Proceeding to feature branch creation...
</template-output>
</check>

<check if="blocking_issues.length == 0">
  <template-output section="no_dependencies">
  ## ✅ No Dependencies

{story_key} has no blocking dependencies. Proceeding to feature branch creation...
</template-output>
</check>

### 1.3: Determine Developer Agent (Junior vs Senior)

<action>
**Determine developer agent based on labels:**

**Step 1: Check for junior developer labels**
Set {{is_junior_task}} = false
IF "Haiku" in {{story_labels}} OR "Junior" in {{story_labels}} OR "Simple" in {{story_labels}}:
Set {{is_junior_task}} = true

**Step 2: Select appropriate developer agent**
IF "BE" in {{story_labels}}:
IF {{is_junior_task}} == true:
{developer_agent} = "spring-junior-webflux-dev"
ELSE:
{developer_agent} = "spring-webflux-kotlin-dev"
ELSE:
IF {{is_junior_task}} == true:
{developer_agent} = "kmp-junior-flow-dev"
ELSE:
{developer_agent} = "kmp-flow-dev"

**Step 3: Determine architect agent (if needed for Complex stories)**
IF "BE" in {{story_labels}}:
{{architect_agent}} = "spring-senior-architect"
ELSE:
{{architect_agent}} = "kmp-senior-architect"

**Step 4: Check for pair programming requirement**
IF "Complex" in {{story_labels}}:
{{pair_programming_required}} = true
ELSE:
{{pair_programming_required}} = false

**Summary**:

- Junior task: {{is_junior_task}}
- Developer: {developer_agent}
- Architect: {{architect_agent}} (only used if Complex)
- Pair programming: {{pair_programming_required}}
  </action>

### 1.4: Identify Sprint Branch

<action>
Query current branch or detect from sprint:

```bash
git branch --list "sprint/{{sprint_number}}-*"
```

Set {sprint_branch} from result
</action>

### 1.5: Transition to In Progress

<action>
**BMad-Master delegates to jira-manager**: Transition story to In Progress

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: transitionJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{story_key}"
- transition: { id: "{{in_progress_transition_id}}" }

**Expected Return**: `{status: "success", current_status: "In Progress", error: null}` OR `{status: "failure", current_status: null, error: "message"}`

Set {current_status} = "In Progress"
</action>

<check if="jira_transition_result.status != 'success'">
  <action>
  🚨 **FAIL-FAST: Jira Transition to In Progress Failed**

**Error**: {{jira_transition_result.error}}
**Story**: {story_key}
**Current Status**: {{jira_transition_result.current_status}}

**STOP**: Ticket must be In Progress before development starts

**User Action Required**:

1. Verify {story_key} exists in Jira
2. Check current ticket status allows transition to In Progress
3. Verify jira-manager agent configuration
4. Resolve error: {{jira_transition_result.error}}
5. Re-run story implementation for {story_key}
   </action>

  <template-output section="jira_transition_in_progress_failed">
  ## ❌ Workflow Stopped: Jira Transition to In Progress Failed

**Phase**: Start Story (Step 1.5)
**Operation**: Transition to In Progress
**Error**: {{jira_transition_result.error}}

**Context**:

- Story: {story_key}
- Current Status: {{jira_transition_result.current_status}}
- Target Status: In Progress

**Remediation**:

1. Check Jira ticket status: `open https://nextgendev.atlassian.net/browse/{story_key}`
2. Verify transition is available from current status
3. Check jira-manager agent: `~/.claude/agents/jira-manager.md`
4. Resolve error and retry
   </template-output>

<action>EXIT workflow</action>
</check>

<action>
✅ Ticket transitioned to In Progress: {story_key}
Proceeding to feature branch creation...
</action>

### 1.6: Create Feature Branch

<action>
**BMad-Master delegates to git-manager**: Create feature branch for {story_key}

**Agent**: git-manager (`~/.claude/agents/git-manager.md`)

**Delegation Instruction**:
"Create feature branch for {story_key}:

STEPS:

1. Checkout sprint branch: git checkout {sprint_branch}
2. Pull latest: git pull origin {sprint_branch}
3. Create feature branch: git checkout -b feature/{story_key}-{{description_slug}}
4. Push: git push -u origin feature/{story_key}-{{description_slug}}

REPORT: Feature branch name"

**Expected Return**: `{status: "success", branch_name: "feature/...", error: null}` OR `{status: "failure", branch_name: null, error: "message"}`

Store {feature_branch} from git-manager response
</action>

<check if="git_manager_result.status != 'success'">
  <action>
  🚨 **FAIL-FAST: Git Branch Creation Failed**

**Error**: {{git_manager_result.error}}
**Sprint Branch**: {sprint_branch}
**Story**: {story_key}

**STOP**: Cannot proceed to development without feature branch

**User Action Required**:

1. Verify {sprint_branch} exists and is accessible
2. Check git-manager agent availability
3. Resolve error: {{git_manager_result.error}}
4. Re-run story implementation for {story_key}
   </action>

  <template-output section="git_branch_failed">
  ## ❌ Workflow Stopped: Git Branch Creation Failed

**Phase**: Start Story (Step 1.6)
**Operation**: Create Feature Branch
**Error**: {{git_manager_result.error}}

**Context**:

- Story: {story_key}
- Sprint Branch: {sprint_branch}
- Attempted Branch: feature/{story_key}-{{description_slug}}

**Remediation**:

1. Verify sprint branch exists: `git branch -r | grep {sprint_branch}`
2. Check git-manager agent: `~/.claude/agents/git-manager.md`
3. Resolve error and retry
   </template-output>

<action>EXIT workflow</action>
</check>

<action>
✅ Feature branch created: {feature_branch}
Ticket is In Progress: {story_key}
Proceeding to state file creation...
</action>

### 1.7: Extract Confluence Links

<action>
**BMad-Master**: Parse Confluence Links from ticket description

**Extract from {{story_description}}**:

- Search for Confluence URLs matching pattern: `https://[workspace].atlassian.net/wiki/spaces/[space]/pages/[pageId]`
- Extract all Confluence links found in description
- Store as {{confluence_links}} array

**Example Patterns**:

- `https://nextgendev.atlassian.net/wiki/spaces/EN/pages/123456/API-Specification`
- `[Architecture Diagram](https://nextgendev.atlassian.net/wiki/spaces/EN/pages/789/Arch)`

**Storage**:

- {{confluence_links}} = ["https://...", "https://..."]
- Empty array if no links found
  </action>

### 1.8: Create State Folder and State File

<action>
**BMad-Master**: Create state folder structure and state file for agent delegation

**Step 1: Create State Folder**

```bash
mkdir -p .bmad/state/story-{story_key}
mkdir -p .bmad/state/story-{story_key}/confluence
```

**Purpose**:

- State folder survives context compact
- Agents use lazy loading cache for ticket.md and confluence/\*.md
- Cleanup after QA PASS

**Step 2: Create State File**

**File Path**: `.bmad/state/story-{story_key}/state.json`

**Schema**:

```json
{
  "ticket": "{story_key}",
  "ticket_type": "story",
  "state_folder": ".bmad/state/story-{story_key}",
  "caches": {
    "ticket": ".bmad/state/story-{story_key}/ticket.md",
    "confluence_dir": ".bmad/state/story-{story_key}/confluence"
  },
  "sprint_branch": "{sprint_branch}",
  "developer_agent": "{developer_agent}",
  "architect_agent": "{{architect_agent}}",
  "pair_programming_required": {{pair_programming_required}},
  "current_status": "To Do",
  "current_phase": "start",
  "iteration_count": 0,
  "dependencies": {{blocking_issues.map(b => b.key)}},
  "blocked_by": [],
  "dependency_check": {
    "last_checked": "{{timestamp}}",
    "blockers_resolved": true
  },
  "confluence_links": {{confluence_links}},
  "runtime_commands": {{runtime_commands}},
  "bug_analysis_report": {{bug_analysis_report}},
  "party_mode_required": {{party_mode_required}},
  "created_at": "{{timestamp}}",
  "last_updated": "{{timestamp}}"
}
```

**Note**: This state file will be passed to all agents for autonomous operation
</action>

### 1.9: Create and Validate Cache Files (MANDATORY)

<action>
**MANDATORY**: story-implementation workflow OWNS cache creation - this step ALWAYS runs

**Purpose**: Create cache files (ticket.md, confluence/\*.md) and validate before delegating to developer agent

**Step 1: Check if cache already exists** (from previous run or manual creation):

```bash
TICKET_CACHE=".bmad/state/story-{story_key}/ticket.md"

# Check if cache already exists
if [ -f "$TICKET_CACHE" ] && [ -s "$TICKET_CACHE" ] && grep -q "## Description" "$TICKET_CACHE"; then
  echo "✅ Cache already exists and is valid - reusing"
  exit 0  # Skip creation, use existing cache
fi

echo "⚠️ Cache not found or invalid - will create new cache"
```

**Step 2: Create cache files via jira-manager delegation** (if not exists or invalid):

**BMad-Master delegates to jira-manager agent**:

"Use jira-manager agent to cache {story_key}"

**jira-manager will create**:

- ticket.md (core ticket details)
- comments/ (individual comment files)
- attachments/ (downloaded attachments)
- confluence/ (if Confluence links exist)
- related-tickets.md (if issue links exist)

**Step 3: Validate cache files created successfully** (CRITICAL):

```bash
TICKET_CACHE=".bmad/state/story-{story_key}/ticket.md"
STATE_FOLDER=".bmad/state/story-{story_key}"

# Check state folder exists
if [ ! -d "$STATE_FOLDER" ]; then
  echo "❌ ERROR: State folder missing - $STATE_FOLDER"
  exit 1
fi

# Check ticket.md exists
if [ ! -f "$TICKET_CACHE" ]; then
  echo "❌ ERROR: ticket.md not created - $TICKET_CACHE"
  echo "Jira cache creation failed - cannot proceed to agent delegation"
  exit 1
fi

# Check ticket.md not empty
if [ ! -s "$TICKET_CACHE" ]; then
  echo "❌ ERROR: ticket.md is empty - $TICKET_CACHE"
  exit 1
fi

# Check for required sections
if ! grep -q "## Description" "$TICKET_CACHE"; then
  echo "❌ ERROR: ticket.md missing Description section"
  exit 1
fi

# Validate new cache structure (comments, attachments)
COMMENTS_DIR="$STATE_FOLDER/comments"
ATTACHMENTS_DIR="$STATE_FOLDER/attachments"

# Check comments directory exists (should always be created)
if [ ! -d "$COMMENTS_DIR" ]; then
  echo "⚠️ WARNING: comments/ directory missing - $COMMENTS_DIR"
  echo "  (This is acceptable if ticket has zero comments)"
fi

# Check attachments directory (optional - only if attachments exist)
if [ -d "$ATTACHMENTS_DIR" ]; then
  ATTACHMENT_COUNT=$(ls -1 "$ATTACHMENTS_DIR" 2>/dev/null | wc -l)
  echo "  - attachments/: $ATTACHMENT_COUNT files ✓"
fi

# Check comments count (informational)
if [ -d "$COMMENTS_DIR" ]; then
  COMMENT_COUNT=$(ls -1 "$COMMENTS_DIR" 2>/dev/null | wc -l)
  echo "  - comments/: $COMMENT_COUNT files ✓"
fi

echo "✅ Cache validation PASSED"
echo "  - State folder: $STATE_FOLDER ✓"
echo "  - ticket.md exists and has content ✓"
echo "  - Required sections present ✓"
echo "  - comments/: ${COMMENT_COUNT:-0} files ✓"
echo "  - attachments/: ${ATTACHMENT_COUNT:-0} files ✓"
```

**Validation Result Handling**:

**IF ANY CHECK FAILS**:

- ABORT workflow immediately
- Report error to {user_name}
- DO NOT proceed to Step 2 (developer agent delegation)
- Message: "Cache file creation failed. Jira-manager must create valid cache files before developer agent can proceed."

**IF ALL CHECKS PASS**:

- Log: "✅ Cache files created and validated successfully"
- Set {{cache_created}} = true
- Proceed to Step 2 (development implementation)

**Note**: This is SINGLE SOURCE OF RESPONSIBILITY for cache creation - story-implementation workflow OWNS this
</action>

## <template-output section="story_started">

## 📝 Starting Story: {story_key}

**Developer Agent:** {developer_agent}
**State Folder:** .bmad/state/story-{story_key}/
**Cache Status:** ✅ Created and validated (Step 1.9)

Cache structure:

- ticket.md ✅ (core ticket details - NO comments)
- comments/ ✅ ({{comment_count}} comments in separate files)
- attachments/ ✅ ({{attachment_count}} files - screenshots, PDFs)
- confluence/ ✅ (if applicable)
- related-tickets.md ✅ (if applicable)

Agent will autonomously:

- Load ticket details from cache (no Jira API call needed)
- Load Confluence docs from cache (if applicable)
- Post start comment to Jira
- Implement solution following TDD
- Run tests and quality gates
- Mark checklist complete

**Workflow handles** (NOT agent responsibility):

- ✅ Feature branch creation (Step 1.5)
- ✅ Transition to In Progress (Step 1.6)
- ✅ Transition to In Review (Step 2.3)

## Delegating to agent...

</template-output>

### 1.10: Enrich State File with Implementation Details

<action>
**Purpose**: Add implementation-specific fields to state.json after cache created

**Step 1: Extract confluence links from cache**:

Read {{state_folder}}/ticket.md and extract Confluence URLs:

- Pattern: `https://[workspace].atlassian.net/wiki/spaces/[space]/pages/[id]`
- Store in {{confluence_links}} array

**Step 2: Update state.json with enriched schema**:

```bash
STATE_FILE=".bmad/state/story-{story_key}/state.json"

# Read current state (created by CCS with 9 orchestration fields)
CURRENT_STATE=$(cat "$STATE_FILE")

# Enrich with implementation details
jq '. + {
  "state_folder": ".bmad/state/story-'{story_key}'",
  "caches": {
    "ticket": ".bmad/state/story-'{story_key}'/ticket.md",
    "comments_dir": ".bmad/state/story-'{story_key}'/comments",
    "confluence_dir": ".bmad/state/story-'{story_key}'/confluence",
    "attachments_dir": ".bmad/state/story-'{story_key}'/attachments"
  },
  "feature_branch": "",
  "current_status": "'{{story_status}}'",
  "current_phase": "start",
  "iteration_count": 0,
  "dependencies": '{{dependencies_from_step_1.2}}',
  "blocked_by": [],
  "dependency_check": {
    "last_checked": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "blockers_resolved": true
  },
  "confluence_links": '{{confluence_links}}',
  "last_updated": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
}' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
```

**Validation**:

- Verify state.json updated successfully
- Check all required fields present
- Confirm confluence_links extracted (if any)

**Result**: Complete state.json with both orchestration (from CCS) and implementation (from SI) fields
</action>

<template-output section="state_enriched">
✅ State file enriched with implementation details
  - Cache paths: ✓
  - Confluence links: {{confluence_links.length}} found
  - Dependencies: {{dependencies.length}} validated
  - Blockers: {{active_blockers.length}} (all resolved)
</template-output>

<checkpoint id="phase_transition">
Set current_phase = "dev"
Save state: story_key, sprint_branch, developer_agent, confluence_links, dependencies, cache_created
</checkpoint>

</step>

---

<step n="2" goal="Development Implementation" phase="dev">
<communication>
Inform {user_name} in {communication_language}: Delegating to developer agent for implementation - agent will autonomously load context from cache, implement solution following TDD, and mark checklist complete
</communication>

<action>Set {current_phase} = "dev"</action>
<action>Increment {{iteration_count}}</action>

### 2.1: Delegate to Developer Agent (Self-Sufficient)

<action>
🚨 **SELF-SUFFICIENT AGENT DELEGATION** (No content passing)

**BMad-Master delegates to developer agent:**

**Agent**: {developer_agent} (kmp-flow-dev OR spring-webflux-kotlin-dev)

**INPUT (ONLY 2 parameters):**

- `ticket_id`: "{story_key}"
- `state_file_path`: ".bmad/state/story-{story_key}/state.json"

**Agent Autonomous Workflow (with Pre-Created Cache):**

**Phase 1: Load Context**

1. Read state.json: Get state_folder, confluence_links, sprint_branch, dependencies

2. Load Jira ticket from cache (ALWAYS exists - created by workflow Step 1.9):
   - Read {{state.caches.ticket}} (ticket.md)
   - Parse ticket content into memory:
     - Description
     - Acceptance criteria
     - Comments
     - Labels, priority, status
   - Log: "Loaded ticket from cache"

3. Load Confluence docs from cache (if applicable):
   - FOR EACH file IN {{state.caches.confluence_dir}}:
     - Read confluence/{filename}.md
     - Parse into memory
   - Log: "Loaded {count} Confluence docs from cache"

**Phase 2: Initialize Work** 4. Post start comment (jira skill): "🚀 Development started by {developer_agent}" 5. Read {{state.feature_branch}} from state.json (workflow created in Step 1.5) 6. Checkout feature branch: `git checkout {{state.feature_branch}}`

**Phase 3: Implementation** 7. Load coding standards (Read tool) 8. Explore codebase (idea skill) 9. Implement following TDD 10. Run quality gates

**Phase 4: Complete** 11. Mark checklist complete (jira skill) 12. Report to BMad Master

**NOT Agent Responsibility** (Workflow handles):

- ❌ Create feature branch (Step 1.5 already created)
- ❌ Transition to "In Progress" (Step 1.6 already transitioned)
- ❌ Transition to "In Review" (Step 2.3 will transition after agent completes)

**NO content passed** - Agent loads from pre-created cache autonomously

**Expected Report Format:**

```
STATUS: COMPLETE
DETAILS: Implementation complete, tests passing, coverage met
COMMITS_PUSHED: 3 commits to {feature_branch}
CHECKLIST_COMPLETE: true
```

**Note**: Agent does NOT report TICKET_STATUS - workflow handles all Jira transitions
</action>

<template-output section="dev_delegation">
## 🚀 Delegating to {developer_agent}

**Ticket:** {story_key}
**State Folder:** .bmad/state/story-{story_key}/
**Cache:** ✅ Pre-created by workflow Step 1.9

Developer agent will autonomously:

- Load context from cache (ticket.md, confluence/\*.md already exist)
- Transition to "In Progress"
- Create feature branch
- Post start comment
- Load coding standards
- Implement + test + push
- Mark checklist complete
- Transition to In Review

BMad Master awaits completion report...
</template-output>

### 2.2: Receive Agent Report & Orchestrate

<action>
**BMad-Master receives developer agent report**

Parse report for:

- STATUS: COMPLETE/INCOMPLETE/BLOCKED
- TICKET_STATUS: Current Jira status (should be "In Review" if complete)
- CHECKLIST_COMPLETE: true/false
- DETAILS: Implementation summary

Store as {{developer_report}}
</action>

<check if="developer_report.STATUS != 'COMPLETE'">
  <action>
  ❌ **DEVELOPMENT INCOMPLETE**

Developer agent reported: {{developer_report.STATUS}}
Details: {{developer_report.DETAILS}}

  <template-output section="dev_incomplete">
  ## ❌ Development Incomplete

**Status:** {{developer_report.STATUS}}
**Details:** {{developer_report.DETAILS}}

BMad Master will review and determine next action...
</template-output>

STOP: Cannot proceed to code review. Address issues and retry.
</action>
</check>

<check if="developer_report.CHECKLIST_COMPLETE != true">
  <action>
  🚨 **CHECKLIST VERIFICATION FAILED**

Developer agent must mark all checklist items complete.
Current status from report: {{developer_report.CHECKLIST_COMPLETE}}

  <template-output section="checklist_incomplete">
  ## 🚨 Checklist Incomplete

Developer Implementation checklist not 100% complete.

Agent must return to ticket and mark all items complete before proceeding.
</template-output>

STOP: Cannot proceed until checklist complete.
</action>
</check>

<check if="developer_report.TICKET_STATUS != 'In Review'">
  <action>
  ⚠️ **UNEXPECTED TICKET STATUS**

Expected: "In Review"
Actual: {{developer_report.TICKET_STATUS}}

Agent should have transitioned ticket. Verify transition occurred.

STOP: Verify ticket status before proceeding.
</action>
</check>

<template-output section="dev_complete">
## ✅ Development Complete

**Developer:** {developer_agent}
**Status:** {{developer_report.STATUS}}
**Ticket Status:** {{developer_report.TICKET_STATUS}}
**Checklist:** {{developer_report.CHECKLIST_COMPLETE ? 'Complete ✅' : 'Incomplete ❌'}}
**Details:** {{developer_report.DETAILS}}

Proceeding to code review phase...
</template-output>

<action>
**Sync Cache**: Update comments cache with latest Jira data

**BMad-Master delegates to jira-manager**:
"Use jira-manager to update comments for {story_key}"

**Result**: Cache synchronized - only fetches new/updated comments (efficient)
</action>

### 2.3: Transition to In Review

<action>
**BMad-Master delegates to jira-manager**: Transition to In Review

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: transitionJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{story_key}"
- transition: { id: "{{in_review_transition_id}}" }

**Expected Return**: `{status: "success", current_status: "In Review", error: null}` OR `{status: "failure", current_status: null, error: "message"}`

Set {current_status} = "In Review"
</action>

<check if="jira_transition_result.status != 'success'">
  <action>
  🚨 **FAIL-FAST: Jira Transition to In Review Failed**

**Error**: {{jira_transition_result.error}}
**Story**: {story_key}
**Current Status**: {{jira_transition_result.current_status}}

**STOP**: Cannot proceed to code review without transition

**User Action Required**:

1. Verify {story_key} exists in Jira
2. Check current ticket status allows transition to In Review
3. Verify jira-manager agent configuration
4. Resolve error: {{jira_transition_result.error}}
5. Re-run story implementation for {story_key}
   </action>

  <template-output section="jira_transition_in_review_failed">
  ## ❌ Workflow Stopped: Jira Transition to In Review Failed

**Phase**: Development Complete (Step 2.3)
**Operation**: Transition to In Review
**Error**: {{jira_transition_result.error}}

**Context**:

- Story: {story_key}
- Current Status: {{jira_transition_result.current_status}}
- Target Status: In Review

**Remediation**:

1. Check Jira ticket status: `open https://nextgendev.atlassian.net/browse/{story_key}`
2. Verify transition is available from current status
3. Check jira-manager agent: `~/.claude/agents/jira-manager.md`
4. Resolve error and retry
   </template-output>

<action>EXIT workflow</action>
</check>

<action>
✅ Ticket transitioned to In Review: {story_key}
Development phase complete. Proceeding to code review...
</action>

<checkpoint id="phase_transition">
Set current_phase = "review"
Save state: iteration_count, current_status = "In Review"
</checkpoint>

</step>

---

<step n="3" goal="Code Review" phase="review">
<communication>
Inform {user_name} in {communication_language}: Development complete - delegating to code reviewer to validate implementation against coding standards and check for Priority 1 violations
</communication>

<action>Set {current_phase} = "review"</action>

### 3.1: Delegate to Code Reviewer Agent (Self-Sufficient)

<action>
🚨 **SELF-SUFFICIENT AGENT DELEGATION** (No content passing)

**BMad-Master delegates to code-reviewer agent:**

**Agent**: code-reviewer

**INPUT (ONLY 2 parameters):**

- `ticket_id`: "{story_key}"
- `state_file_path`: ".bmad/state/story-{story_key}/state.json"

**Agent Autonomous Workflow:**

1. Read state file: Extract feature_branch, caches.ticket, caches.confluence_dir
2. Validate cache: Check ticket.md exists and not empty (Bash tool)
3. Load ticket from cache (Read tool): Parse ticket.md for ACs, Labels, Description
4. Load Confluence from cache (Read tool - if applicable)
5. View code changes (read-git skill): "Show diff for {feature_branch}"
6. Load coding standards (Read tool)
7. Analyze code (code-review skill): Comprehensive review
8. Check Priority 1 violations (code-review skill)
9. IF APPROVED: Mark Code Review checklist complete (jira skill)
10. Post review comment to Jira (jira skill)
11. Report to BMad Master

**NOT Agent Responsibility** (Workflow handles):

- ❌ Transition to "In Test" (Step 3.2 will transition if approved)
- ❌ Transition to "In Progress" (Step 3.2 will transition if rejected)

**NO content passed** - Agent fetches everything autonomously

**Expected Report Format:**

```
STATUS: COMPLETE
RESULT: APPROVED/REJECTED
CHECKLIST_COMPLETE: true (if approved) OR false (if rejected)
DETAILS: Review summary with rating or violations
```

**Note**: Agent does NOT report TICKET_STATUS - workflow handles all Jira transitions
</action>

<template-output section="review_delegation">
## 🔍 Delegating to code-reviewer

**Ticket:** {story_key}
**State File:** .bmad/state/story-{story_key}/state.json

Code reviewer will autonomously:

- Load ticket from cache (NO Jira API calls)
- View code changes via Git
- Load coding standards
- Analyze for Priority 1 violations
- Mark checklist complete (if approved)
- Post review to Jira

**Workflow handles** (NOT reviewer responsibility):

- ✅ Transition to In Test (if approved) - Step 3.2
- ✅ Transition to In Progress (if rejected) - Step 3.2

BMad Master awaits review report...
</template-output>

### 3.2: Receive Review Report & Orchestrate

<action>
**BMad-Master receives code-reviewer report**

Parse report for:

- STATUS: COMPLETE/INCOMPLETE
- RESULT: APPROVED/REJECTED
- CHECKLIST_COMPLETE: true/false
- DETAILS: Review summary

Store as {{review_report}}
</action>

<check if="review_report.STATUS != 'COMPLETE'">
  <action>
  🚨 **REVIEW INCOMPLETE**

Code reviewer reported: {{review_report.STATUS}}
Details: {{review_report.DETAILS}}

STOP: Verify code reviewer agent execution
Manual intervention may be required.
</action>
<action>EXIT workflow</action>
</check>

<check if="review_report.RESULT == 'REJECTED'">
  ### ❌ Review REJECTED - Return to Development

  <template-output section="review_rejected">
## ❌ Code Review REJECTED

**Iteration:** {{iteration_count}}
**Reviewer:** code-reviewer

**Violations Found:**
{{review_report.DETAILS}}

**Actions Taken:**

- ✅ Reviewer posted violations to Jira
- ⏳ Workflow will transition ticket to In Progress

Returning to development phase...
</template-output>

  <action>
  **BMad-Master delegates to jira-manager**: Transition to In Progress (rejected)

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: transitionJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{story_key}"
- transition: { id: "{{in_progress_transition_id}}" }

**Expected Return**: `{status: "success", current_status: "In Progress", error: null}` OR `{status: "failure", current_status: null, error: "message"}`

Set {current_status} = "In Progress"
</action>

  <check if="jira_transition_result.status != 'success'">
    <action>
    🚨 **FAIL-FAST: Jira Transition to In Progress Failed**

    **Error**: {{jira_transition_result.error}}
    **Context**: Code review rejected, attempting to return to development

    STOP: Cannot proceed without valid ticket state
    </action>
    <action>EXIT workflow</action>

  </check>

  <action>
  ✅ Ticket transitioned to In Progress (code review rejected)
  </action>

  <action>
  **Sync Cache**: Update comments cache with latest Jira data

**BMad-Master delegates to jira-manager**:
"Use jira-manager to update comments for {story_key}"

**Result**: Cache synchronized - only fetches new/updated comments (efficient)
</action>

  <checkpoint id="phase_transition">
  Set current_phase = "dev"
  Save state: review_report, current_status = "In Progress", iteration_count++
  </checkpoint>

<goto step="2"/> <!-- Loop back to Step 2: Development -->
</check>

<check if="review_report.RESULT == 'APPROVED'">
  ### ✅ Review APPROVED - Proceed to QA

  <check if="review_report.CHECKLIST_COMPLETE != true">
    <action>
    🚨 **CHECKLIST VERIFICATION FAILED**

    Code Review checklist not marked complete by agent.
    Agent must return to ticket and mark all items before proceeding.

    STOP: Cannot proceed until checklist complete.
    </action>
    <action>EXIT workflow</action>

  </check>

  <template-output section="review_approved">
## ✅ Code Review APPROVED

**Reviewer:** code-reviewer
**Checklist:** Complete ✅
**Iteration:** {{iteration_count}}

**Details:** {{review_report.DETAILS}}

**Actions Taken:**

- ✅ Reviewer posted approval to Jira
- ✅ Reviewer marked Code Review checklist complete
- ⏳ Workflow will transition ticket to In Test

Proceeding to QA validation...
</template-output>

  <action>
  **BMad-Master delegates to jira-manager**: Transition to In Test (approved)

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: transitionJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{story_key}"
- transition: { id: "{{in_test_transition_id}}" }

**Expected Return**: `{status: "success", current_status: "In Test", error: null}` OR `{status: "failure", current_status: null, error: "message"}`

Set {current_status} = "In Test"
</action>

  <check if="jira_transition_result.status != 'success'">
    <action>
    🚨 **FAIL-FAST: Jira Transition to In Test Failed**

    **Error**: {{jira_transition_result.error}}
    **Context**: Code review approved, attempting to proceed to QA

    STOP: Cannot proceed without valid ticket state
    </action>
    <action>EXIT workflow</action>

  </check>

  <action>
  ✅ Ticket transitioned to In Test (code review approved)
  </action>

  <action>
  **Sync Cache**: Update comments cache with latest Jira data

**BMad-Master delegates to jira-manager**:
"Use jira-manager to update comments for {story_key}"

**Result**: Cache synchronized - only fetches new/updated comments (efficient)
</action>

  <checkpoint id="phase_transition">
  Set current_phase = "qa"
  Save state: review_report, current_status = "In Test"
  </checkpoint>
</check>

</step>

---

<step n="4" goal="QA Validation" phase="qa">
<communication>
Inform {user_name} in {communication_language}: Code review approved - delegating to QA agent to run quality gates, validate acceptance criteria, and verify all tests pass
</communication>

<action>Set {current_phase} = "qa"</action>

### 4.1: Delegate to QA Agent (Self-Sufficient)

<action>
🚨 **SELF-SUFFICIENT AGENT DELEGATION** (No content passing)

**BMad-Master delegates to qa agent:**

**Agent**: qa

**INPUT (ONLY 2 parameters):**

- `ticket_id`: "{story_key}"
- `state_file_path`: ".bmad/state/story-{story_key}/state.json"

**Agent Autonomous Workflow:**

1. Read state file: Extract feature_branch, caches.ticket, caches.confluence_dir
2. Validate cache: Check ticket.md exists and not empty (Bash tool)
3. Load ticket from cache (Read tool): Parse ticket.md for ACs, Labels, Description
4. Load attachments from cache (Read tool - for UI stories): Check screenshots
5. View code changes (read-git skill): "Show diff for {feature_branch}"
6. Load test standards (Read tool): docs/qa/testing-standards.md
7. Run tests (idea skill + Bash): ./gradlew test, koverVerify, build
8. Validate acceptance criteria from ticket
9. IF PASS: Mark QA Validation checklist complete (jira skill)
10. Post QA report to Jira (jira skill)
11. Report to BMad Master

**NOT Agent Responsibility** (Workflow handles):

- ❌ Transition to "QA PASS" (Step 4.2 will transition if pass)
- ❌ Transition to "In Progress" (Step 4.2 will transition if fail)

**CRITICAL**: Workflow transitions to "QA PASS" (NOT "Done") - PO owns final acceptance

**NO content passed** - Agent fetches everything autonomously

**Expected Report Format:**

```
STATUS: COMPLETE
RESULT: PASS/FAIL
CHECKLIST_COMPLETE: true (if pass) OR false (if fail)
DETAILS: QA validation summary with test results
```

**Note**: Agent does NOT report TICKET_STATUS - workflow handles all Jira transitions
</action>

<template-output section="qa_delegation">
## 🧪 Delegating to qa agent

**Ticket:** {story_key}
**State File:** .bmad/state/story-{story_key}/state.json

QA agent will autonomously:

- Load ticket from cache (NO Jira API calls)
- View code changes via Git
- Run all quality gates (tests, coverage, build)
- Validate acceptance criteria
- Mark checklist complete (if pass)
- Post QA report to Jira

**Workflow handles** (NOT QA responsibility):

- ✅ Transition to QA PASS (if pass) - Step 4.2
- ✅ Transition to In Progress (if fail) - Step 4.2

BMad Master awaits QA report...
</template-output>

### 4.2: Receive QA Report & Orchestrate

<action>
**BMad-Master receives qa agent report**

Parse report for:

- STATUS: COMPLETE/INCOMPLETE
- RESULT: PASS/FAIL
- CHECKLIST_COMPLETE: true/false
- DETAILS: QA validation summary

Store as {{qa_report}}
</action>

<check if="qa_report.STATUS != 'COMPLETE'">
  <action>
  🚨 **QA INCOMPLETE**

QA agent reported: {{qa_report.STATUS}}
Details: {{qa_report.DETAILS}}

STOP: Verify QA agent execution
Manual intervention may be required.
</action>
<action>EXIT workflow</action>
</check>

<check if="qa_report.RESULT == 'FAIL'">
  ### ❌ QA FAILED - Return to Development

  <template-output section="qa_failed">
## ❌ QA Validation FAILED

**Iteration:** {{iteration_count}}
**QA Agent:** qa

**Failures Found:**
{{qa_report.DETAILS}}

**Actions Taken:**

- ✅ QA posted failure report to Jira
- ⏳ Workflow will transition ticket to In Progress

Returning to development phase...
</template-output>

  <action>
  **BMad-Master delegates to jira-manager**: Transition to In Progress (QA failed)

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Delegation Instruction**:
"Transition {story_key} to In Progress:

OPERATION: transitionJiraIssue
PARAMETERS:

- cloudId: \"{jira_cloud_id}\"
- issueIdOrKey: \"{story_key}\"
- transition: { id: \"{{in_progress_transition_id}}\" }

CONTEXT: QA validation failed - returning to development for fixes

RETURN: { status: 'success', transitionId: '...' } OR { status: 'failed', error: '...' }"

Set {current_status} = "In Progress"
</action>

  <check if="jira_transition_result.status != 'success'">
    <action>
    🚨 **FAIL-FAST: Jira Transition to In Progress Failed**

    **Context**: QA failed, attempting to return story to development
    **Error**: {{jira_transition_result.error}}
    **Impact**: Cannot proceed without valid ticket state

    STOP: Manual Jira intervention required
    </action>
    <action>EXIT workflow</action>

  </check>

  <action>
  ✅ Ticket transitioned to In Progress (QA failed - returning to development)
  </action>

<action>
**Sync Cache**: Update comments cache with latest Jira data

**BMad-Master delegates to jira-manager**:
"Use jira-manager to update comments for {story_key}"

**Result**: Cache synchronized - only fetches new/updated comments (efficient)
</action>

  <checkpoint id="phase_transition">
Set current_phase = "dev"
Save state: qa_report, current_status = "In Progress", iteration_count++
  </checkpoint>

<goto step="2"/> <!-- Loop back to Step 2: Development -->
</check>

<check if="qa_report.RESULT == 'PASS'">
  ### ✅ QA PASSED - Proceed to Merge

  <check if="qa_report.CHECKLIST_COMPLETE != true">
    <action>
    🚨 **CHECKLIST VERIFICATION FAILED**

    QA Validation checklist not marked complete by agent.
    Agent must return to ticket and mark all items before proceeding.

    STOP: Cannot proceed until checklist complete.
    </action>
    <action>EXIT workflow</action>

  </check>

  <action>
  ✅ Checklist verification passed - all QA Validation items complete
  </action>

  <action>
  **BMad-Master delegates to jira-manager**: Transition to QA PASS (approved)

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Delegation Instruction**:
"Transition {story_key} to QA PASS:

OPERATION: transitionJiraIssue
PARAMETERS:

- cloudId: \"{jira_cloud_id}\"
- issueIdOrKey: \"{story_key}\"
- transition: { id: \"{{qa_pass_transition_id}}\" }

CONTEXT: QA validation passed - all tests, coverage, and acceptance criteria met

RETURN: { status: 'success', transitionId: '...' } OR { status: 'failed', error: '...' }"

Set {current_status} = "QA PASS"
</action>

  <check if="jira_transition_result.status != 'success'">
    <action>
    🚨 **FAIL-FAST: Jira Transition to QA PASS Failed**

    **Context**: QA passed, attempting to move to QA PASS status
    **Error**: {{jira_transition_result.error}}
    **Impact**: Cannot proceed to merge without valid ticket state

    STOP: Manual Jira intervention required
    </action>
    <action>EXIT workflow</action>

  </check>

  <action>
  ✅ Ticket transitioned to QA PASS (validation passed - ready for merge)
  </action>

  <template-output section="qa_passed">
## ✅ QA Validation PASSED

**QA Agent:** qa
**Checklist:** Complete ✅
**Iteration:** {{iteration_count}}

**Details:** {{qa_report.DETAILS}}

**Actions Taken:**

- ✅ QA posted success report to Jira
- ✅ QA marked all validation checklist items complete
- ✅ Workflow transitioned ticket to QA PASS

🎯 **Note**: Ticket in "QA PASS" status - PO will manually move to "Done" after final acceptance

All quality gates passed! Proceeding to merge...
</template-output>

<action>
**Sync Cache**: Update comments cache with latest Jira data

**BMad-Master delegates to jira-manager**:
"Use jira-manager to update comments for {story_key}"

**Result**: Cache synchronized - only fetches new/updated comments (efficient)
</action>

  <checkpoint id="phase_transition">
Set current_phase = "merge"
Save state: qa_report, current_status = "QA PASS"
  </checkpoint>
</check>

</step>

---

<step n="5" goal="Merge to Sprint Branch" phase="merge">
<communication>
Inform {user_name} in {communication_language}: QA validation passed - merging feature branch to sprint branch with quality gates and cleaning up state folder
</communication>

<action>Set {current_phase} = "merge"</action>

### 5.1: Merge Feature Branch

<invoke-task agent="git-manager">
Merge {feature_branch} to {sprint_branch} with quality gates.

STEPS:

1. Checkout sprint branch: git checkout {sprint_branch}
2. Pull latest: git pull origin {sprint_branch}
3. Run quality gates:
   - ./gradlew test (must pass)
   - ./gradlew koverVerify (must pass)
   - ./gradlew build (must pass)
4. Merge feature branch: git merge --no-ff {feature_branch} -m "Merge {story_key}: {{story_summary}}"
5. Push to origin: git push origin {sprint_branch}
6. Delete local feature branch: git branch -d {feature_branch}
7. Delete remote feature branch: git push origin --delete {feature_branch}

REPORT:

- Merge commit hash
- Quality gates: ALL PASS/FAIL
- Feature branch deleted: ✅/❌
  </invoke-task>

### 5.2: Add Merge Comment

<action>
**BMad-Master delegates to jira-manager**: Add merge completion comment

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: addCommentToJiraIssue
**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{story_key}"
- commentBody: Merge completion message with commit hash, quality gates status, and timestamp
  </action>

<checkpoint id="phase_transition">
Set current_phase = "complete"
Save state: merge_commit_hash, current_status = "Done"
</checkpoint>

### 5.3: Cleanup State Folder Cache 🆕

<action>
**BMad-Master**: Clean up state folder after successful merge

**Purpose**: Remove cached data (ticket.md, confluence/\*.md) now that story is merged and complete

```bash
rm -rf .bmad/state/story-{story_key}/
```

**Rationale**: Cleanup AFTER merge ensures context preserved if PO rejects post-QA but pre-merge

**Note**: State folder safe to delete - all implementation data persisted in Git and Jira
</action>

</step>

---

<step n="6" goal="Completion" phase="complete">
<communication>
Inform {user_name} in {communication_language}: Story implementation complete - all quality gates passed, feature merged to sprint branch, and workflow finished successfully
</communication>

<action>Set {current_phase} = "complete"</action>

## <template-output section="story_complete">

## 🎉 Story COMPLETE: {story_key}

**Summary:** {{story_summary}}
**Iterations:** {{iteration_count}}
**Merge Commit:** {{merge_commit_hash}}
**Sprint Branch:** {sprint_branch}

**Quality Gates:** ALL PASS ✅

- Development Implementation ✅
- Code Review APPROVED ✅
- QA Validation PASSED ✅
- Merged to Sprint Branch ✅

## Story implementation cycle complete!

</template-output>

<checkpoint id="phase_transition">Workflow complete. State folder already cleaned up after QA PASS.</checkpoint>

<action>STOP: Story implementation complete</action>

</step>

</workflow>
