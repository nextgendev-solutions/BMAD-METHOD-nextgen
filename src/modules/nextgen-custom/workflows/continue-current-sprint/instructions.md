# Continue Current Sprint Workflow Instructions

**Purpose:** Resume active sprint by picking next story and executing implementation

---

<workflow name="continue-current-sprint" version="1.1.0">

## Jira Configuration (Self-Sufficient Reference)

**Project**: ESNG (eSIM NextGen)
**Board ID**: 100 (`{jira_board_id}`)
**Cloud ID**: `bfeeb19d-00e7-42ae-8fe6-d1decb3d2c30` (`{jira_cloud_id}`)
**Project Key**: ESNG (`{jira_project_key}`)

### Status Workflow

```
To Do → In Progress → In Review → In Test → QA PASS → Done
```

**Note**: Full Jira/Git workflow details are in the story-implementation workflow (SI).
CCS handles story selection; SI handles the full dev cycle.

---

## Recovery Protocol

<check if="state_file_exists">
  <action>Load state → Verify completed stories in Jira → Prompt to resume</action>
</check>

---

<step n="1" goal="Identify Next Story">
<communication>
Inform {user_name} in {communication_language}: Identifying next story from active sprint backlog
</communication>

### 1.1: Get Current Sprint Stories (Multi-Phase with Fallbacks)

<action>
**Phase 1: Get Active Sprint ID**

**BMad-Master delegates to jira-manager**: Fetch active sprint for board

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: Custom API call
**Endpoint**: GET /rest/agile/1.0/board/{jira_board_id}/sprint?state=active
**Parameters**:

- cloudId: "{jira_cloud_id}"
- boardId: "{jira_board_id}"

**Expected Return**:

```json
{
  "values": [
    {
      "id": 199,
      "name": "Sprint 3",
      "state": "active",
      "startDate": "2025-11-11",
      "endDate": "2025-11-13"
    }
  ]
}
```

Store:

- {active_sprint_id} = values[0].id
- {active_sprint_name} = values[0].name
- {active_sprint_number} = extract number from name

**If empty/error**: Report "No active sprint found" and STOP
</action>

<action>
**Phase 2: Get Sprint Backlog (Primary Query)**

**BMad-Master delegates to jira-manager**: Fetch stories in active sprint

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: searchJiraIssuesUsingJql
**Parameters**:

- cloudId: "{jira_cloud_id}"
- jql: "project={jira_project_key} AND sprint={active_sprint_id} AND status NOT IN (Done, Merged, 'QA PASS') ORDER BY Rank ASC, priority DESC"
- maxResults: 50
- fields: ["key", "summary", "status", "priority", "labels", "customfield_10016", "sprint"]

**Expected Return**: Array of sprint stories (not Done/Merged)

Store in {available_stories}
</action>

<check if="available_stories.length == 0 OR jira_query_failed">
  <action>
  **Phase 3: Fallback Query (if primary fails)**

**BMad-Master delegates to jira-manager**: Fallback query without sprint ID

**Operation**: searchJiraIssuesUsingJql
**Parameters**:

- cloudId: "{jira_cloud_id}"
- jql: "project={jira_project_key} AND status='To Do' ORDER BY Rank ASC"
- maxResults: 50

**Filter client-side**:

- Check sprint field matches {active_sprint_name}
- OR check labels contain "sprint-{active_sprint_number}"

Store filtered results in {available_stories}
</action>
</check>

<check if="available_stories.length == 0">
  <template-output section="sprint_empty">
## ✅ Sprint Complete!

No remaining stories in active sprint.

**Next Steps:**

1. Close sprint: `/close-sprint {active_sprint_number}`
2. Or add more stories to sprint
   </template-output>
   <action>STOP: No stories available</action>
   </check>

### 1.2: Select Next Story

<action>
Filter logic:
- Exclude "Blocked" status
- Exclude "In Review", "In Test" status
- Pick highest priority from "Sprint Backlog" or "In Progress"

Set {selected_story} = top result
</action>

<template-output section="next_story">
## 📝 Next Story Selected: [{{selected_story.key}}: {{selected_story.summary}}]({{selected_story.url}})

**Priority:** {{selected_story.priority}}
**Status:** {{selected_story.status}}
**Type:** {{selected_story.labels.join(', ')}}
**Story Points:** {{selected_story.storyPoints}}

🚀 **Proceeding with implementation...**
</template-output>

<check if="execution.mode != 'autonomous'">
  <ask>Proceed with {{selected_story.key}}? (yes/no):</ask>

  <check if="user_response != 'yes'">
    <action>STOP: User declined. Workflow paused.</action>
  </check>
</check>

<checkpoint id="unknown"  id="story_complete">Save state: selected_story</checkpoint>

</step>

<step n="2" goal="Prepare Execution Context">
<communication>
Inform {user_name} in {communication_language}: Preparing execution context with bug analysis (if applicable) and runtime commands
</communication>

### 2.1: Extract Minimal Story Metadata (Orchestration Only)

<action>
**BMad-Master**: Read ONLY essential metadata for orchestration

**Purpose**: Minimal Jira read for bug analysis routing and party-mode detection

**Extract from {selected_story}** (already fetched in Step 1.1):

- {{story_key}} = selected_story.key
- {{story_labels}} = selected_story.labels
- {{story_type}} = selected_story.issueType
- {{story_status}} = selected_story.status

**NOT FETCHED**: Full description, acceptance criteria, attachments
**Reason**: story-implementation workflow agents fetch autonomously

**Storage**: Use {selected_story} data already in memory from Step 1.1
</action>

### 2.2: Run Bug Analyzer (Bug Tickets Only)

<check if="story_type == 'Bug'">
  <action>
Determine {{bug_analysis_agent}} using labels:
  - If labels intersect any of ["BE", "Backend", "Reactive", "Spring", "WebFlux", "MongoDB"] → `spring-bug-analyzer`
  - Otherwise → `kmp-bug-analyzer`

**BMad-Master delegates to {{bug_analysis_agent}}**:

- Execute full bug analysis (runtime reproduction, log capture, dependency tracing)
- Post YAML report + log paths to Jira comment
- Set Jira labels as needed (`High-Risk`, `Deep-Dive`, or `Complex`)
- Return structured summary → store in {{bug_analysis_report}}
  </action>

  <template-output section="bug_analysis_complete">

## 🧪 Bug Analysis Complete

- Analyzer: {{bug_analysis_agent}}
- Report saved to Jira and {{bug_analysis_report.location}}
- Severity: {{bug_analysis_report.severity}}
</template-output>

  <action>
If {{bug_analysis_report.severity}} in ["High", "Critical"] → add label `High-Risk` (jira-manager)
If {{bug_analysis_report.requires_deep_dive}} == true → add label `Deep-Dive`
  </action>
</check>

### 2.3: Inject Runtime Command Bundle

<action>
Build {{runtime_commands}} map **conditionally** based on {{story_labels}}:

**Backend Stories** (if labels intersect ["BE", "Backend", "Spring", "WebFlux", "Reactive", "MongoDB"]):

- `backend`: `"mcp__idea__execute_run_configuration(configurationName: 'services')"`
- NOTE: Use IDEA run configuration for backend development (NOT shell script)
- Frontend connects to staging backend (no local frontend startup for BE-only stories)

**Frontend/KMP Stories** (if labels intersect ["KMP", "Shared", "Platform", "UI", "Frontend", "Compose"]):

- `compose_app`: `"mcp__idea__execute_run_configuration(configurationName: 'composeApp')"`
- `ios`: `"scripts/run-ios-simulator.sh"` if file exists, otherwise `"./gradlew :iosApp:run"` (confirm availability)
- NOTE: Frontend connects to staging backend (no local backend startup)

**Default**: If no matching labels → include only `compose_app` (assume KMP/Frontend work)

Verify each run configuration exists via `mcp__idea__get_run_configurations`; remove entries that fail validation.
Share validated {{runtime_commands}} with downstream agents via workflow context and Jira comment.
</action>

### 2.4: Evaluate Party-Mode Pairing

<action>
Set {{party_mode_required}} = false by default.

Triggers that set {{party_mode_required}} = true:

1. Jira labels include `Complex`, `High-Risk`, or `Deep-Dive`
2. {{bug_analysis_report.severity}} in ["High", "Critical"]
3. Any agent (architect/developer) returns status "Blocked - Deep Dive"
4. Manual override from {user_name}

If true → record rationale in {{party_mode_reason}}.
</action>

<check if="party_mode_required == true">
  <template-output section="party_mode_entry">
## 🤝 Party-Mode Required

Reason: {{party_mode_reason}}

Participants:

1. Senior Architect (Spring or KMP based on ticket)
2. Senior Developer (matching domain)

BMad-Master: Launch party-mode workflow before standard implementation continues.
</template-output>
</check>

</step>

<step n="3" goal="Execute Story Implementation Cycle">
<communication>
Inform {user_name} in {communication_language}: Delegating to story-implementation workflow for full development cycle
</communication>

### 3.1: Load Story Implementation Workflow Instructions (CRITICAL)

<action>
**MANDATORY**: Load story-implementation instructions into context BEFORE executing

**File**: `bmad/nextgen-custom/workflows/story-implementation/instructions.md`

**Use Read tool** to load complete instructions (1,015 lines) - NO offset/limit

**Verify loaded** by checking for these sections:

- Phase 0: Codebase Exploration
- Phase 1: Implementation
- Phase 2: Code Review
- Phase 6: Complete and Return

**If not loaded**: ABORT and report error - cannot proceed without full context
</action>

### 3.2: Create State Folder Structure

<action>
**Create state folder** for {{selected_story.key}}:

```bash
mkdir -p .bmad/state/story-{{selected_story.key}}
mkdir -p .bmad/state/story-{{selected_story.key}}/confluence
```

**Verify** folders created successfully
</action>

### 3.3: Determine Developer Agent from Labels

<action>
**Agent Selection Logic**:

Examine {{story_labels}}:

- If labels intersect ["BE", "Backend", "Spring", "WebFlux", "Reactive", "MongoDB"] → {{developer_agent}} = "spring-webflux-kotlin-dev"
- Else if labels intersect ["KMP", "Shared", "Platform", "UI", "Frontend", "Compose"] → {{developer_agent}} = "kmp-flow-dev"
- Else → Default to "kmp-flow-dev"

**Architect Agent** (same logic):

- Backend → {{architect_agent}} = "spring-senior-architect"
- KMP/Frontend → {{architect_agent}} = "kmp-senior-architect"
  </action>

### 3.5: Detect Current Sprint Branch

<action>
**Get current branch** to detect sprint context:

```bash
git rev-parse --abbrev-ref HEAD
```

**Expected patterns**:

- `sprint/3-contracts-module-migration` → {{sprint_branch}} = "sprint/3-contracts-module-migration"
- `sprint/2-*` → {{sprint_branch}} = detected branch name
- `main` or other → Search for active sprint branch:
  ```bash
  git branch -r | grep -E 'origin/sprint/[0-9]+' | head -1 | sed 's/origin\///' | xargs
  ```

**Validation**:

- IF {{sprint_branch}} found and valid → Use it
- IF empty or not found → {{sprint_branch}} = "main" (fallback for hotfixes)
  </action>

### 3.6: Create Orchestration Metadata

<action>
**Create minimal state file with orchestration metadata**:

**Required fields** (orchestration only):

```json
{
  "ticket": "{{selected_story.key}}",
  "ticket_type": "{{story_type}}",
  "sprint_branch": "{{sprint_branch}}",
  "developer_agent": "{{developer_agent}}",
  "architect_agent": "{{architect_agent}}",
  "pair_programming_required": {{party_mode_required}},
  "runtime_commands": {{runtime_commands}},
  "bug_analysis_report": {{bug_analysis_report}},
  "created_at": "{{date:now}}"
}
```

**Save to**: `.bmad/state/story-{{selected_story.key}}/state.json`

**Note**: story-implementation workflow will enrich this state with implementation details (cache paths, feature_branch, dependencies, confluence_links, etc.) after cache creation in Step 1.10
</action>

### 3.7: Delegate to Story Implementation Workflow (Full Cycle)

<action>
**BMad-Master delegates to story-implementation workflow**:

**Workflow**: `bmad/nextgen-custom/workflows/story-implementation/instructions.md`
**Inputs**:

- story_key: "{{selected_story.key}}"
- sprint_number: "{active_sprint_number}"
- runtime_commands: {{runtime_commands}}
- bug_analysis_report: {{bug_analysis_report}}
- party_mode_required: {{party_mode_required}}

**Story-implementation workflow will autonomously execute**:

- Phase 1: Development (delegate to {{developer_agent}})
- Phase 2: Code Review (delegate to code-reviewer)
- Phase 3: QA Validation (delegate to qa agent)
- Phase 4: Merge (delegate to git-manager)
- Phase 5: Completion and cleanup

**Full Cycle**: Dev → Review → QA → Merge → Done

**Expected Return**:

```
STATUS: COMPLETE
PHASE: complete
TICKET_STATUS: QA PASS (PO manually transitions to Done - workflow NEVER transitions to Done)
MERGE_COMMIT: {hash}
ITERATIONS: {count}
```

**Note**: story-implementation workflow OWNS cache creation and full implementation cycle
</action>

<action>Add {{selected_story.key}} to {{completed_stories}}</action>

<checkpoint id="unknown"  id="story_complete">Save state: completed_stories</checkpoint>

</step>

<step n="4" goal="Runtime Verification & Evidence Upload">
<communication>
Inform {user_name} in {communication_language}: Collecting and uploading runtime verification evidence to Jira
</communication>

<action>
Collect runtime evidence artifacts from development and QA phases:
  - Uploaded logs / recordings / screenshots (attach to Jira)
  - Command outputs from {{runtime_commands}}
  - Runtime verification checklist status

Set {{runtime_evidence}} = {
status: "verified",
artifacts: [list Jira attachment links, log paths, recordings],
commands: {{runtime_commands}},
notes: "All ACs validated via runtime execution"
}

If any artifact missing or command failed:

- Update {{runtime_evidence.status}} = "failed"
- Append reason(s) to {{runtime_evidence.notes}}
- Push details into {{runtime_failure_notes}}
  </action>

<check if="runtime_evidence.status != 'verified'">
  <action>
Record failure context in {{runtime_failure_notes}}
Notify BMad-Master to log workflow/agent update recommendation.
Return issue to In Progress and notify responsible agent.
  </action>
</check>

<template-output section="runtime_complete">
## ✅ Runtime Verification Complete

Evidence bundle captured and attached to Jira.
</template-output>

<action>
If runtime failures occurred:
  - Comment on Jira with remediation steps
  - Add checklist item: "Workflow update required" for tracking
  - Schedule follow-up task after resolution
</action>

</step>

<step n="5" goal="Check for More Stories">
<communication>
Inform {user_name} in {communication_language}: Checking for remaining stories in sprint backlog
</communication>

<action>
**BMad-Master delegates to jira-manager**: Re-fetch remaining stories

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: searchJiraIssuesUsingJql
**Parameters**:

- cloudId: "{jira_cloud_id}"
- jql: "project={jira_project_key} AND sprint IN openSprints() AND status != Done ORDER BY priority DESC"
- maxResults: 50

**Expected Return**: Array of remaining stories
</action>

<check if="remaining_stories.length == 0">
  <template-output section="sprint_complete">
## 🎉 Sprint {active_sprint_number} Complete!

All stories finished. Ready for sprint closure.

**Completed This Session:** {{completed_stories.join(', ')}}

**Next Steps:**

1. Close sprint: `/close-sprint {active_sprint_number}`
2. Create retrospective: `/retrospective Sprint {active_sprint_number}`
   </template-output>

<checkpoint id="unknown"  id="story_complete">Workflow complete. Delete state file.</checkpoint>
<action>
**Cleanup state file:**

```bash
rm -f .bmad/state/continue-current-sprint-*.json
```

**Note**: Story-level state folders (`.bmad/state/story-*/`) already cleaned by story-implementation workflow
</action>
<action>STOP</action>
</check>

<check if="execution.mode != 'autonomous'">
  <ask>Continue with next story? (yes/no):</ask>

  <check if="user_response == 'yes'">
    <goto step="1"/>  <!-- Loop back to Step 1 -->
  </check>

  <template-output section="paused">
## ⏸️ Sprint Paused

Completed stories this session: {{completed_stories.join(', ')}}

Remaining: {{remaining_stories.length}} stories

**Resume anytime with:** `Continue current sprint`
</template-output>
</check>

<check if="execution.mode == 'autonomous'">
  <action>Display: "✅ Story complete! Moving to next story..."</action>
  <goto step="1"/>  <!-- Auto-loop in autonomous mode -->
</check>

<checkpoint id="unknown"  id="story_complete">Workflow complete. Delete state file.</checkpoint>
<action>
**Cleanup state file:**

```bash
rm -f .bmad/state/continue-current-sprint-*.json
```

**Note**: Story-level state folders already cleaned by story-implementation workflow
</action>

</step>

</workflow>
