<workflow>

<critical>Communicate in {communication_language} throughout the workflow</critical>

# Backlog Refinement Workflow Instructions

**Purpose:** Refine top backlog items with complete details and mark them "Ready for Sprint"

---

## State File Management

**State Folder**: `.bmad/state/backlog-refinement-{session_id}/`

<action>
**At workflow start, create state folder and initialize state.json**:

```bash
# Generate session ID (timestamp-based)
SESSION_ID=$(date +%Y%m%d-%H%M%S)
STATE_DIR=".bmad/state/backlog-refinement-${SESSION_ID}"

# Create state folder
mkdir -p "${STATE_DIR}"

# Initialize state.json
cat > "${STATE_DIR}/state.json" << 'EOF'
{
  "workflow": "backlog-refinement",
  "session_id": "${SESSION_ID}",
  "started_at": "$(date -Iseconds)",
  "status": "in_progress",
  "selected_tickets": [],
  "refined_tickets": [],
  "design_blocked_tickets": [],
  "current_ticket_index": 0,
  "cache_dir": "${STATE_DIR}"
}
EOF
```

Store `{state_dir}` = "${STATE_DIR}" for use throughout workflow.
Store `{state_file}` = "${STATE_DIR}/state.json" for recovery.
</action>

## Recovery Protocol

<check if="state_file_exists">
  <action>
  **Recovery from previous session**:

1. Scan `.bmad/state/backlog-refinement-*/state.json` for sessions with `status: "in_progress"`
2. Load most recent state file → Parse JSON
3. Verify refined tickets in Jira → Compare with `refined_tickets` array
4. Prompt user: "Found incomplete session from {started_at}. Resume? (yes/no)"
5. If yes → Set `{state_dir}` and `{state_file}` from recovered session
6. If no → Create new session (run State File Management above)
   </action>
   </check>

---

<step n="1" goal="Retrieve Top Backlog Items">

<action>Communicate in {communication_language} with {user_name}</action>

<action>
**BMad-Master delegates to jira-manager**: Fetch backlog items

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: searchJiraIssuesUsingJql

**Parameters**:

- cloudId: "{jira_cloud_id}"
- jql: "project=ESNG AND status=\"To Do\" AND type != Epic AND labels NOT IN (\"Ready-for-Sprint\") ORDER BY Rank ASC, created ASC"
- maxResults: {max_tickets}

**Expected Return**: Array of ticket objects with keys, summaries, priorities, labels, and acceptance criteria status

Store results in: {available_tickets}
</action>

<template-output section="backlog_items">
## Top {{available_tickets.length}} Backlog Items

{{#each available_tickets}}
{{@index}}. **{{this.key}}**: {{this.summary}}

- Priority: {{this.priority}}
- Labels: {{this.labels.join(', ')}}
- Has ACs: {{#if this.hasAcceptanceCriteria}}Yes{else}No{{/if}}
  {{/each}}

Select items to refine (comma-separated numbers):
</template-output>

<ask>Enter ticket numbers:</ask>

<action>Parse → Store in {selected_tickets}</action>

<action>
**Update state.json**:
```bash
jq '.selected_tickets = $tickets | .current_ticket_index = 0' \
  --argjson tickets '["'"$(echo {selected_tickets} | sed 's/,/","/g')"'"]' \
  "{state_file}" > "{state_file}.tmp" && mv "{state_file}.tmp" "{state_file}"
```
</action>

</step>

---

<step n="2" goal="Refine Each Ticket">

<action>Communicate in {communication_language} with {user_name}</action>

<for-each ticket in selected_tickets>

<action>Set {current_ticket_index} = {{@index}}</action>

### 2.0: Force Re-Cache Current Ticket + Linked Ticket Detection

<action>
**FORCE RE-CACHE Current Ticket** (overwrite existing cache):

**BMad-Master delegates to jira-manager**: Cache current ticket

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: cache_jira_ticket

**Parameters**:

- issue_key: {current_ticket}
- force_overwrite: true ← CRITICAL: Always overwrite existing cache
- cache_dir: `{state_dir}/{current_ticket}/`

**Why Force Overwrite**:

- Ticket may have been updated since pre-refinement
- Separate sessions require fresh baseline
- Ensures agents work with latest data

**Expected Return**: Cache folder path

Store in {cached_ticket_folders}

---

**Detect Linked Tickets** (BE ↔ UI relationships):

1. Fetch current ticket issue links via jira-manager:
   - Check link types: "relates to", "blocks", "is blocked by"

2. Analyze links for BE ↔ UI relationship:
   - IF current ticket has BE label AND links to ticket with (UI|Shared|Platform) label → linked_ticket = true
   - IF current ticket has (UI|Shared|Platform) label AND links to ticket with BE label → linked_ticket = true
   - ELSE → linked_ticket = false

3. IF linked_ticket = true:
   - **Fetch linked ticket on-demand via MCP** (NO caching):
     ```
     jira_get_issue(issue_key={linked_ticket_key}, fields="*all")
     ```
   - Store linked ticket data in {linked_ticket_data}
   - Proceed to Step 2.1aa (Contract Design Session)

---

**🚨 MANDATORY: Read Blocking & Related Ticket Designs**

This step ensures agents understand shared contracts, DTOs, and entities from dependent tickets BEFORE codebase search.

4. **Fetch ALL linked tickets** (not just BE ↔ UI):
   - Use issue links from step 1: "blocked by", "blocks", "relates to"
   - For EACH linked ticket → `jira_get_issue(issue_key={linked_key}, fields="*all")`

5. **Extract Design Artifacts** from linked ticket descriptions:
   - Code blocks (kotlin, json, gherkin)
   - DTOs, entities, repository signatures, API contracts
   - Store in {upstream_designs[ticket_key]}

6. **Priority Enforcement**:
   - **"is blocked by" tickets**: 🔴 **MANDATORY** - These define contracts THIS ticket MUST use. Extract ALL code blocks and treat as source of truth. DO NOT propose alternatives.
   - **"relates to" tickets**: 🟡 **RECOMMENDED** - Check for shared contracts, avoid duplication.
   - **"blocks" tickets**: 🟢 **INFORMATIONAL** - Understand downstream consumers.

7. **Store for Later Steps**:
   - {blocking_ticket_designs} = Designs from "is blocked by" tickets (MUST REUSE)
   - {related_ticket_designs} = Designs from "relates to" tickets (SHOULD CHECK)
   - These are used in Step 2.1c (Codebase Search) and Party-Mode discussions
     </action>

<template-output section="linked_ticket_detection">
## 🔗 Linked Ticket Detection: {{current_ticket}}

{{#if linked_ticket}}
✅ **Linked Ticket Detected**: {{linked_ticket_key}}

- Current ticket label: {{current_ticket_label}}
- Linked ticket label: {{linked_ticket_label}}
- Relationship: {{link_type}}

📦 **Caching Tickets**:

- Cached: {{current_ticket}} → {cached_folder_path_1}
- Cached: {{linked_ticket_key}} → {cached_folder_path_2}

⏭️ Next: Contract Design Session (Step 2.1aa)
{{else}}
ℹ️ No BE ↔ UI linked ticket detected - proceeding with standard refinement
{{/if}}

{{#if blocking_tickets.length > 0}}
🚨 **Blocking Ticket Designs (MUST REUSE)**:
{{#each blocking_tickets}}

- **{{this.key}}**: {{this.summary}}
  - Contracts extracted: {{this.extracted_artifacts}}
    {{/each}}
    {{/if}}

{{#if related_tickets.length > 0}}
🔗 **Related Ticket Designs (CHECK FOR REUSE)**:
{{#each related_tickets}}

- **{{this.key}}**: {{this.summary}}
  {{/each}}
  {{/if}}
  </template-output>

<gate name="cache_verification" blocking="true">
  <verify>File {state_dir}/{current_ticket}/ticket.md EXISTS</verify>
  <on-failure>HARD STOP - Cache missing. Retry Step 2.0.</on-failure>
</gate>

### 2.1: Read Ticket Details from Cache

<action>
**Read from cache** (created in Step 2.0):

- `{state_dir}/{current_ticket}/ticket.md` → {ticket_summary}, {ticket_description}, {ticket_status}, {ticket_labels}
- `{state_dir}/{current_ticket}/confluence/*.md` → {confluence_context}
- `{state_dir}/{current_ticket}/comments/*.md` → for Step 2.1a
  </action>

### 2.1a: Parse @Mentions from Jira

<action>
**Parse @mentions from cached ticket data**

**Input**:

- Ticket Key: {current_ticket}
- Description: {ticket_description} (from cached ticket.md)
- Comments: Read from {state_dir}/{current_ticket}/comments/\*.md

**Processing**:

1. Scan description + all footer comments for regex: `@(\w+)`
2. Extract ±2 sentences context around each mention
3. Map mention to BMAD agent using agent_mention_mapping (from bmad/core/config.yaml)
4. Return structured mention objects

**Expected Return**: Array of mention objects (or empty array if none)

**Store in workflow state**: {{mentions_found[current_ticket]}}

**Reference**: docs/workflows/mention-parsing-protocol.md
</action>

<check if="mentions_found[current_ticket].length > 0">
  <template-output section="mentions_detected">
## 🔔 Mentions Detected in {current_ticket}

Found {{mentions_found[current_ticket].length}} agent mention(s):

{{#each mentions_found[current_ticket]}}
{{@index + 1}}. **{{this.mention}}** ({{this.agent_id}})

- Source: {{this.source}}
- Context: "{{this.context}}"
  {{/each}}

These agents will be notified during party-mode discussion.
</template-output>
</check>

### 2.1b: UX Design Validation

**Duration**: 5-25 minutes (depends on ticket preparation state)

<action>
**Check ticket labels** to determine refinement path:

<check if="!ticket.labels.includes('Pre-Refined')">
  **⛔ TICKET NOT PRE-REFINED - Cannot Proceed**

  <template-output>
⛔ **{current_ticket} is NOT pre-refined**

This ticket lacks the "Pre-Refined" label and cannot proceed through backlog-refinement.

**Required Action**:

1. Exit this session
2. Run pre-refinement workflow: `/BMad:nextgen-custom:workflows:pre-refinement {current_ticket}`
3. Complete the pre-refinement process
4. Return to backlog-refinement with the pre-refined ticket

**Why?** Pre-refinement ensures:

- ACs are validated with PO
- Story points are estimated
- Dependencies are identified
- UX designs are reviewed

Skipping to next ticket (if any)...
</template-output>

  <action>
  Add to {{tickets_skipped}}: {current_ticket}
  Skip to next ticket in batch
  </action>
</check>

<check if="ticket.labels.includes('Pre-Refined')">
  **PRE-REFINED TICKET - Full Backlog Refinement** (20-25 min)

Set {{refinement_path[current_ticket]}} = "full"

**BMad-Master delegates to ux-exprt (Sally)**: Deep UX validation and active fixing

**Agent**: bmad:bmm:agents:ux-exprt

**Sally's Full Validation Workflow**:

#### For Stories with "Screen", "Interface", "View", "Modal", "Dialog", "Form", "Button", "Menu" in Title:

**DEEP ACTIVE REVIEW WITH FIXING** (20-25 min):

**Step 1: Load Complete Design Context**

1. Read ticket requirements + ALL acceptance criteria
2. Load referenced wireframe file and sections (from Jira description)
3. Load prototype file (if referenced)
4. Load `docs/design/design-system.md` for compliance validation
5. Query sibling stories in same epic for consistency comparison

**Step 2: Active Requirements vs Design Comparison**
Sally MUST validate line-by-line:

**Functional Alignment**:

- [ ] Every AC has corresponding wireframe interaction
- [ ] Wireframe interactions match described user flows
- [ ] All user actions in ACs are documented in wireframe
- [ ] Error states in ACs have wireframe representations
- [ ] Loading states in ACs have wireframe/prototype animations

**Component Specifications**:

- [ ] Button dimensions match design-system.md (minimum 48dp touch targets)
- [ ] Typography uses correct type scale (not arbitrary sp values)
- [ ] Spacing follows 4dp/8dp grid (no arbitrary margins like 12dp, 15dp)
- [ ] Colors use Material3 semantic tokens (no hardcoded hex values)
- [ ] Component states documented (default, hover, pressed, disabled, loading, error, success)

**Visual Consistency**:

- [ ] Visual hierarchy matches importance (primary actions prominent)
- [ ] Color contrast meets accessibility (WCAG AA minimum)
- [ ] Icon usage consistent with design-system.md icon library
- [ ] Elevation/shadows match Material3 levels

**Step 2.5: Playwright Prototype Validation** (IF prototype file exists)

<action>
**Use Playwright MCP to validate prototype implementation**:

**Step 2.5a: Navigate to Prototype**

- Use `mcp__MCP_DOCKER__browser_browser_navigate` to open prototype HTML file (file:// URL)
- Wait for page load with `mcp__MCP_DOCKER__browser_browser_wait_for`

**Step 2.5b: Interactive Validation**

- Use `mcp__MCP_DOCKER__browser_browser_snapshot` to get accessibility tree
- Use `mcp__MCP_DOCKER__browser_browser_click` to test button interactions
- Navigate through states (default → hover → pressed → loading → error → success)
- Verify state transitions work as documented in wireframes

**Step 2.5c: Measurements via JavaScript**

- Use `mcp__MCP_DOCKER__browser_browser_evaluate` to measure:
  ```javascript
  // Touch target validation
  const results = [];
  document.querySelectorAll('button, a, input').forEach((el) => {
    const rect = el.getBoundingClientRect();
    const isValid = rect.width >= 48 && rect.height >= 48;
    if (!isValid) {
      results.push({
        element: el.tagName + (el.className ? '.' + el.className : ''),
        actual: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        required: '48x48',
        pass: false,
      });
    }
  });
  return results;
  ```
- Check Material3 token usage:
  ```javascript
  // Verify CSS custom properties (Material3 tokens)
  const results = [];
  const computedStyle = getComputedStyle(document.documentElement);
  const tokens = ['--md-sys-color-primary', '--md-sys-color-secondary', '--md-sys-color-error'];
  tokens.forEach((token) => {
    const value = computedStyle.getPropertyValue(token);
    results.push({ token, found: !!value });
  });
  return results;
  ```
- Validate 8dp grid spacing:
  ```javascript
  // Check if all margins/padding are divisible by 8
  const violations = [];
  document.querySelectorAll('*').forEach((el) => {
    const style = getComputedStyle(el);
    ['marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(
      (prop) => {
        const px = parseInt(style[prop]);
        if (px > 0 && px % 8 !== 0) {
          violations.push({
            element: el.tagName + (el.className ? '.' + el.className : ''),
            property: prop,
            value: px + 'px',
            issue: 'Not 8dp aligned',
          });
        }
      },
    );
  });
  return violations;
  ```

**Step 2.5d: Capture Screenshot from Prototype**

- Use `mcp__MCP_DOCKER__browser_browser_take_screenshot` to capture screenshot from rendered UI
- Save to: `.playwright-mcp/{current_ticket}-prototype.png`
- Store result in {{playwright_screenshots_captured[current_ticket]}}

**Step 2.5e: Validation Results**

- Store validation results in {{prototype_validation_results[current_ticket]}}
- Add any Playwright-detected issues to {ux_issues_found}
  </action>

**Step 3: Cross-Story Design Consistency**
Sally checks sibling stories for pattern consistency:

1. Fetch all stories in same epic via jira-manager
2. Compare design patterns across siblings:
   - Button styles (primary, secondary, text)
   - Form layouts (field spacing, label placement)
   - Error message presentation
   - Loading indicators
   - Navigation patterns
3. Identify inconsistencies:
   - "ESNG-41 uses 56dp button height, this story uses 48dp"
   - "ESNG-42 error messages are red text, this uses snackbar"
   - "ESNG-43 form fields have 16dp spacing, this has 12dp"

**Step 4: Detect Look-and-Feel Issues**
Sally identifies quality problems:

**Common Issues to Detect**:

- Oversized/undersized components (e.g., 72dp button when 48dp is standard)
- Spacing violations (arbitrary values like 6dp, 13dp, 27dp instead of 8dp increments)
- Typography mismatches (using bodyLarge when bodyMedium appropriate)
- Color token violations (using `error` for non-error states)
- Missing interactive states (no loading/error states in prototype)
- Poor visual hierarchy (secondary action more prominent than primary)
- Accessibility violations (touch targets <48dp, contrast <4.5:1)

**Step 5: Present Issues in Party-Mode Prep**

<check if="ux_issues_found.length > 0">
  <action>
  Sally prepares findings presentation with detailed references:

**Sally's Presentation Format**:

## UX Issues Found: {current_ticket}

### Critical Issues (Block Development):

1. **Touch Target Violation** (`docs/design/wireframes-*.md:LINE`)
   - Current: Component XYZ dimensions
   - Required: Minimum standard per design-system.md
   - Impact: Accessibility/usability failure
   - Fix: Update wireframe, adjust dimensions

2. **Color Token Violation** (`docs/design/wireframes-*.md:LINE`)
   - Current: Hardcoded color value
   - Required: Material3 semantic token
   - Impact: Theme inconsistency
   - Fix: Replace with proper token

### Design Inconsistencies (Cross-Story):

3. **Pattern Mismatch** (vs SIBLING-KEY)
   - Sibling story: Pattern A
   - This story: Pattern B
   - Impact: Inconsistent UX
   - Fix: Align patterns

### Missing Specifications:

4. **State Undocumented** (`docs/design/wireframes-*.md:LINE-RANGE`)
   - AC mentions state, wireframe doesn't show it
   - Prototype doesn't implement state
   - Impact: Dev will guess, inconsistency risk
   - Fix: Add state documentation

**Total Issues**: {ux_issues_count}
**Estimated Fix Time**: {estimated_fix_time} minutes
</action>
</check>

**Step 6: Get PO Approval for Fixes**

<check if="ux_issues_found.length > 0">
  <ask>
Sally found {ux_issues_count} UX issues in {current_ticket}.

**Options**:
A) Sally fixes now ({estimated_fix_time} min) - Continue refinement after fixes
B) Mark "Design-Inconsistency" and BLOCK "Ready-for-Sprint" (HARD GATE)

Enter A or B:
</ask>

<action>Store in {po_fix_decision}</action>
</check>

**Step 7A: IF PO APPROVES FIX (Option A)**

<check if="po_fix_decision == 'A'">
  <action>
  Sally performs fixes:

1. **Update Wireframes**:
   - Edit `docs/design/wireframes-*.md` files
   - Fix component dimensions, colors, spacing
   - Add missing states/sections
   - Document changes in file comments

2. **Update Prototypes** (if applicable):
   - Edit HTML prototype files in `docs/design/prototypes/`
   - Fix interactions, animations, states
   - Ensure prototype matches updated wireframes

3. **Update Design System** (if pattern is new/changed):
   - Update `docs/design/design-system.md`
   - Document new component specs
   - Add to component library

4. **Commit to Git** via git-manager:

   ```
   git add docs/design/wireframes-*.md docs/design/prototypes/*.html docs/design/design-system.md
   git commit -m "fix(design): Resolve UX issues in {current_ticket}

   - Fix touch target violations (48dp minimum)
   - Replace hardcoded colors with Material3 tokens
   - Align button styles with sibling stories for consistency
   - Add missing state documentation

   Issues resolved: {{ux_issues_found.length}}"
   git push
   ```

5. **Take new screenshot** of updated wireframe

6. **Update Jira** via jira-manager:
   - Attach new screenshot
   - Update description with new wireframe line references
   - Add comment documenting fixes

7. **Update Confluence** via confluence-manager:
   - Update design page with new specs
   - Link to Git commit

Store in {ux_fixes_applied}
Set {{design_sign_off[current_ticket].approved}} = true
</action>

  <template-output section="ux_fixed">
✅ **Sally fixed {{ux_issues_found.length}} UX issues**
- Wireframes updated: {files_updated}
- Git commit: {commit_hash}
- Jira screenshot updated: ✅
- Confluence updated: ✅
- Design sign-off: ✅ APPROVED

Proceeding with refinement...
</template-output>
</check>

**Step 7B: IF PO DECLINES FIX (Option B) - HARD GATE**

<check if="po_fix_decision == 'B'">
  <action>
  **BMad-Master delegates to jira-manager**: Block ticket

**Operations**:

1. Add label "Design-Inconsistency"
2. Add comment documenting all issues (with file:line references)
3. **DO NOT add "Ready-for-Sprint" label** (BLOCKED)
4. Mark ticket status remains "To Do" (not moving to "Ready-for-Sprint")

Store in {design_blocked_tickets}
Set {{design_sign_off[current_ticket].approved}} = false
Set {{design_sign_off[current_ticket].issues}} = {ux_issues_found}
</action>

  <template-output section="ux_blocked">
⛔ **{current_ticket} BLOCKED - Design issues unresolved**

**Label Added**: "Design-Inconsistency"
**Status**: Remains in "To Do" - NOT marked "Ready-for-Sprint"
**Issues Documented**: {{ux_issues_found.length}} issues in Jira comment

Ticket cannot proceed to sprint until design issues resolved.

**Skipping to next ticket...**
</template-output>

  <action>
  Skip remaining steps for this ticket (party-mode, description update, Ready-for-Sprint)
  Move to next ticket in {selected_tickets}
  </action>
</check>

<check if="ux_issues_found.length == 0">
  <action>
  No UX issues found - Sally approves design

Set {{design_sign_off[current_ticket].approved}} = true
Set {{design_assets_prepared[current_ticket]}} = true
</action>

  <template-output section="ux_approved">
✅ **Sally's UX Review: APPROVED**
- Requirements match wireframes: ✅
- Design system compliance: ✅
- Cross-story consistency: ✅
- Accessibility validated: ✅

Proceeding with refinement...
</template-output>
</check>

#### For BE/Shared/Platform Stories (No Screen in Title):

**LIGHT REVIEW** (10 min):

1. Review user-facing aspects:
   - API error messages (clear, actionable, consistent with design-system.md tone?)
   - Response structures (consistent, predictable, documented?)
   - Loading states (communicated to UI, documented for frontend?)
   - Edge cases (documented for UX handling?)
2. Check if story impacts user experience
3. Validate error message consistency across related stories
4. Note any UX considerations in Jira description

**Sally's Questions to Other Agents**:

- Backend Dev: "What error messages will users see?"
- KMP Dev: "What loading states does UI need to handle?"
- QA: "What edge cases impact user flow?"

**Sign-Off**:

- Light review complete → Sally approves
- User-facing concerns found → Sally notes in Jira, approves with recommendations

<action>
Set {{design_sign_off[current_ticket].approved}} = true
Set {{sally_review_complete[current_ticket]}} = "light_review"
</action>
</action>

<action>
**Update state.json with UX validation results**:
```bash
jq '.ux_validation[$ticket] = {
  "sally_review_complete": $sally_complete,
  "design_assets_prepared": $assets_prepared,
  "ux_issues_found": $issues_found,
  "design_sign_off": $sign_off
}' --arg ticket "{current_ticket}" \
   --argjson sally_complete '{sally_review_complete}' \
   --argjson assets_prepared '{design_assets_prepared}' \
   --argjson issues_found '{ux_issues_found}' \
   --argjson sign_off '{design_sign_off}' \
   "{state_file}" > "{state_file}.tmp" && mv "{state_file}.tmp" "{state_file}"
```
</action>

### 2.1aa: Contract Design Session (Linked Tickets Only)

<check if="linked_ticket == true">
<action>
**Dual-Agent Contract Design Session** (10-15 min):

**Participants**:

- spring-webflux-kotlin-dev (backend perspective)
- kmp-flow-dev (frontend perspective)
- Share: Current ticket cache folder + linked ticket data from MCP fetch

**Discussion Topics**:

1. **API Endpoint Specifications**:
   - HTTP method (GET/POST/PUT/DELETE)
   - Path (e.g., `/api/v1/users/{userId}`)
   - Request DTO shape (fields, types, validation rules)
   - Response DTO shape (fields, types, example JSON)
   - Error responses (4xx/5xx codes, error DTO)

2. **DTO Field Design** (:contracts module):
   - Which ticket creates DTO? (usually BE ticket)
   - Which ticket uses DTO? (usually UI ticket)
   - DTO location: :contracts/src/commonMain/kotlin/dto/{DtoName}.kt
   - Fields: name, type, @Serializable, validation annotations

3. **Reactive Pattern Coordination**:
   - Backend: Mono (single value) or Flux (stream)?
   - Frontend: Flow, StateFlow, or SharedFlow?
   - Backpressure handling needed?

4. **Security Coordination**:
   - JWT token required?
   - RBAC checks needed?
   - Input validation rules?

**Output Method**:

1. **APPEND** contract details to BOTH ticket descriptions (NOT override):
   - Section: "## API Contract"
   - Use ADF code blocks with `json` syntax for request/response examples
   - Use ADF code blocks with `kotlin` syntax for DTO code examples
2. **Add comment** to BOTH tickets: "API contract defined in :contracts/{DtoName}.kt"
3. Store in {api_contracts}

**Code Block Format** (MANDATORY):

```json
{
  "userId": "string",
  "email": "string"
}
```

**NOT** Wiki markup:

```
{noformat}
{"userId": "string"}
{noformat}
```

</action>

<template-output section="contract_design_result">
## ✅ API Contract Design Complete

**Endpoint**: {{http_method}} {{api_path}}
**DTO Location**: :contracts/{{dto_file_path}}

**Request**: {{request_dto_fields}}
**Response**: {{response_dto_fields}}

**Reactive Coordination**:

- Backend: {{backend_reactive_type}} (Mono/Flux)
- Frontend: {{frontend_reactive_type}} (Flow/StateFlow)

**Both tickets updated with contract details (APPENDED to description).**
</template-output>
</check>

### 2.1c: Examine Existing Codebase (Pre-Party-Mode)

<action>
**🚨 CRITICAL: Check Blocking Ticket Designs FIRST**

Before searching codebase, check {blocking_ticket_designs} from Step 2.0:

- IF artifact exists in blocking ticket → USE IT (do not search codebase)
- IF artifact NOT in blocking tickets → Search codebase
- Blocking ticket designs are SOURCE OF TRUTH (even if not implemented yet)

---

**BMad-Master delegates to developer agent**: Quick codebase scan for reusable components

**Agent Selection**:

- If {ticket_labels} contains "BE" → delegate to spring-webflux-kotlin-dev
- If {ticket_labels} contains "Shared" or "Platform" or "UI" → delegate to kmp-flow-dev
- Default → kmp-flow-dev

**Agent**: spring-webflux-kotlin-dev OR kmp-flow-dev (based on label)

**Task**: Search for existing implementations before party-mode

**🔴 MANDATORY INPUT**: Provide {blocking_ticket_designs} to agent - these define contracts this ticket MUST use

**Module-Specific Search Scopes** (MANDATORY - see docs/architecture/coding-standards.md#codebase-search-scope):

1. **Determine module from labels**: Parse {ticket_labels} to identify target module
2. **Execute module-specific search**:
   - composeApp → Search: composeApp + shared + services
   - shared → Search: shared + services
   - services → Search: services only
3. **Extract feature keywords** from {ticket_summary}
4. **Search patterns**:
   ```bash
   Glob: {module}/src/**/*{FeatureName}*.kt
   Grep: {FeatureName} in {module}/src/
   ```

**Store Results**:

- {{existing_implementations[current_ticket]}} = File paths found
- {{reusable_components[current_ticket]}} = Components to reuse
- {{patterns_found[current_ticket]}} = Patterns to follow

**Report Format** (for party-mode):

```
Codebase Context for {current_ticket}:
✅ Found: {component} in {module}/src/{path}
→ Can reuse: {yes/no}
→ Pattern to follow: {description}

OR

No existing implementation - building from scratch
```

</action>

<action>
**Update state.json with codebase findings**:
```bash
jq '.codebase_context[$ticket] = {
  "existing_implementations": $impl,
  "reusable_components": $reuse,
  "patterns_found": $patterns
}' --arg ticket "{current_ticket}" \
   --argjson impl '{existing_implementations}' \
   --argjson reuse '{reusable_components}' \
   --argjson patterns '{patterns_found}' \
   "{state_file}" > "{state_file}.tmp" && mv "{state_file}.tmp" "{state_file}"
```
</action>

### 2.2: Party-Mode Discussion (Full Detailed Design)

**Duration**: 30-45 minutes

**Focus**: Complete detailed design with implementation approach for ALL tickets

<action>
Execute full party-mode refinement session for {current_ticket}:

**Context for Party-Mode**:

- Ticket: {current_ticket}
- Summary: {ticket_summary}
- Description: {ticket_description}
- Confluence Context: {confluence_context}
- **🔔 Agent Mentions**: {{mentions_found[current_ticket]}}
- **🚨 Blocking Ticket Designs**: {blocking_ticket_designs} ← MUST REUSE these contracts/DTOs/entities
- **🔗 Related Ticket Designs**: {related_ticket_designs} ← CHECK for shared artifacts

**Mention Handling**:
{{#each mentions_found[current_ticket]}}

- **{{this.agent_id}}**: You were mentioned in {{this.source}}:

  > "{{this.context}}"

  Please address this mention during the discussion.
  {{/each}}

**Session Type**: Backlog Refinement (Full)

**Required Participants**: ALL project agents

- Product Manager - User stories, acceptance criteria, business value
- Architect - Technical architecture, design patterns, system impact
- Backend Dev (spring-webflux-kotlin-dev) - Spring WebFlux implementation
- KMP Dev (kmp-flow-dev) - Compose Multiplatform / shared module
- UX Expert (Sally - bmad:bmm:agents:ux-exprt) - Validates UX, fixes design issues
- Code Reviewer - Code standards, architecture compliance
- QA - Testing strategy, coverage requirements, AC validation
- Scrum Master (facilitates session)

**Discussion Topics**:
{{#if mentions_found[current_ticket].length > 0}} 0. **🔔 Address Mentions FIRST** (Mentioned agents respond)
{{/if}}

1. User Story & Business Value (PM leads)
2. Technical Architecture (Architect leads)
3. **🎨 UX/Design Consistency Review (Sally leads)**
   - Present UX issues found (if any)
   - Discuss design fixes and rationale
   - Validate cross-story consistency
   - Confirm design sign-off or blocking decision
4. **🔍 Codebase Context Review (Devs lead)**
   - Present findings from {{existing_implementations[current_ticket]}}
   - Propose reuse strategy for {{reusable_components[current_ticket]}}
   - Explain patterns to follow from {{patterns_found[current_ticket]}}
   - Example: "Found EmailValidator in shared/src/util/ - will reuse and extend"
5. Implementation Approach (Devs lead - BASED ON CODEBASE FINDINGS)
   - For MongoDB entities: Follow entity standards (@Document, @TypeAlias, AbstractEntity)
6. Acceptance Criteria Completeness (PM + QA + Sally validate)
7. Testing Strategy (QA leads)
8. Code Standards & Patterns (Code Reviewer validates)
9. Dependencies & Blockers (All identify)
10. Story Point Estimation (All vote)

**Required Output**:

- Complete acceptance criteria (PM + QA approved)
- Technical notes (Architect + Devs approved)
- Testing approach (QA + Devs approved)
- Dependencies identified (All agents)
- Story points (consensus vote)

Execute: \*party-mode
</action>

<check if="mentions_found[current_ticket].length > 0">
  <action>
  Store mention responses from party-mode:

{{mention_responses[current_ticket]}} = [
{
agent_id: "{mentioned_agent_id}",
mention_context: "{original_mention_context}",
response: "{agent_response_from_party_mode}"
},
...
]
</action>
</check>

### 2.3: APPEND Technical Details to Description

<action>
**STEP 1: APPEND Technical Sections** (NOT override)

**BMad-Master delegates to jira-manager**: APPEND technical details to existing description

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: append_to_description (ADF format)

**CRITICAL RULES**:

1. **APPEND ONLY** - Never replace existing description
2. **ALL code examples MUST use ADF code blocks** with syntax highlighting
3. **NO Wiki markup** ({noformat}, {{...}}) - lacks syntax highlighting

**Code Block Format Examples**:

- Kotlin code: `code_block(code, 'kotlin')`
- JSON examples: `code_block(json, 'json')`
- Bash commands: `code_block(cmd, 'bash')`
- Gherkin ACs: `code_block(scenarios, 'gherkin')`

**Sections to APPEND**:

1. "## Technical Notes"
   - Module placement (with `kotlin` code blocks for imports)
   - Reactive patterns (with `kotlin` code blocks for operators)
   - Reuse strategy (with file paths in `code` marks)
   - MongoDB entity standards (if creating new MongoDB entities):
     - Must extend `AbstractEntity` from `services/.../common/domain/`
     - Must use `@Document(collection = "collectionName")` annotation
     - Must use `@TypeAlias("alias")` annotation
     - Reference: `services/src/.../user/domain/User.kt`

2. "## Testing Approach"
   - Test cases enumeration
   - Mock data (with `kotlin` code blocks)
   - Coverage targets

3. "## Dependencies"
   - Jira links context
   - Blocking/blocked by explanations

4. "## Implementation Approach" ← NEW SECTION (from Topic 5 party-mode)
   - **DTO Class Definitions** (kotlin code blocks):
     - Request/Response DTOs with @Serializable
     - Enum definitions with values
     - Field annotations and validation
   - **Entity/Domain Models** (kotlin code blocks):
     - @Document entities extending base classes
     - Field mappings and MongoDB annotations
     - **MongoDB Entity Standards (MANDATORY)**:
       - ALL MongoDB entities MUST extend `AbstractEntity` (from `services/.../common/domain/`)
       - ALL MongoDB entities MUST use `@Document(collection = "collectionName")` annotation
       - ALL MongoDB entities MUST use `@TypeAlias("alias")` annotation
       - Reference implementation: `services/src/.../user/domain/User.kt`
       - Code template:
         ```kotlin
         @Document(collection = "entityName")
         @TypeAlias("entityAlias")
         data class EntityName(
           @Indexed(unique = true)
           val uniqueField: String,
           // ... other fields
         ) : AbstractEntity()
         ```
   - **Service Method Signatures** (kotlin code blocks):
     - Key service methods with reactive chains
     - Validation logic examples
     - Error handling patterns
   - **Repository Interfaces** (kotlin code blocks):
     - Repository interface signatures
     - Custom query methods if needed
   - **MongoDB Schema** (json/bash code blocks):
     - Index creation commands
     - Unique constraints
     - Partial filter expressions

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- sections_to_append: [
  {heading: "Technical Notes", content: {technical_notes_adf}},
  {heading: "Testing Approach", content: {testing_approach_adf}},
  {heading: "Dependencies", content: {dependencies_adf}},
  {heading: "Implementation Approach", content: {implementation_approach_adf}}
  ]

**Expected Return**: Success confirmation

**Validation**: jira-manager will verify all code blocks have `language` attribute set
</action>

<action>
**STEP 2: Add Acceptance Criteria as Native Action Items**

**BMad-Master delegates to jira-manager**: Create Acceptance Criteria Action Items (ADF format)

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: Create Action Items using REST API v3 with ADF format (see jira-manager.md Section 2)

**Delegation Instruction**:
"Create Preliminary Acceptance Criteria as Native Jira Action Items for {current_ticket}:

Heading: 'Acceptance Criteria (Preliminary)'
Items: Use localId naming ac-1, ac-2, ..., ac-N
Format: Each AC as separate taskItem with state='TODO'

APPEND to existing description (do not replace). Use ADF taskList/taskItem structure."

**Pass to jira-manager**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- ac_items: {acceptance_criteria} (array of text items from party-mode discussion)

**Expected Return**: Success confirmation with number of AC items created

**Implementation Note**: jira-manager will:

1. Fetch current description ADF via REST API
2. Parse existing content array
3. Add heading: {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Acceptance Criteria (Preliminary)"}]}
4. Add taskList with proper localId naming (ac-1, ac-2, ..., ac-N)
5. PUT updated ADF back to ticket
6. Verify Action Items appear in Jira UI

**Note**: These are PRELIMINARY Action Items - will be converted to Gherkin format in Step 2.7a
</action>

### 2.4: Add Confluence Links (if applicable)

<check if="related_confluence_docs.length > 0">
  <action>
  **BMad-Master delegates to jira-manager**: Append Confluence links to description

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: editJiraIssue (append to existing description)

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- fields:
  - description: {current_description} + "\n\n📎 Related Docs:\n" + {confluence_links_formatted}

**Expected Return**: Success confirmation
</action>
</check>

### 2.5: Set Story Points (Stories/Tasks/Epics only)

<action>
**Set story points via Jira Agile API** (if issue type supports it)

**⚠️ IMPORTANT LIMITATION**:

- Story points can ONLY be set for: **Story**, **Task**, **Epic** issue types
- **Bug** issue types do NOT support story points via Agile API
- This is a Jira Cloud limitation, not a workflow bug

**Method**: Use curl with Jira Agile API (Rovo MCP and jira-manager do NOT support story points)

**Command Template**:

```bash
curl -s -X PUT "https://nextgendevsolutions.atlassian.net/rest/agile/1.0/issue/{current_ticket}/estimation?boardId=100" \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"value":"{story_points}"}'
```

**Example** (ESNG-74 = 8 story points):

```bash
curl -s -X PUT "https://nextgendevsolutions.atlassian.net/rest/agile/1.0/issue/ESNG-74/estimation?boardId=100" \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"value":"8"}'
```

**Expected Response**:

```json
{ "fieldId": "customfield_10038", "value": 8.0 }
```

**Error for Bugs**:

```json
{ "errorMessages": ["The field 'ESNG-XX' is not editable on issue 'Scrum board' due to its issue type."], "errors": {} }
```

**Handling Bugs**: Skip story points for Bug issue types and document in comment instead.
</action>

### 2.6: Create Issue Links (Dependencies)

<action>
**Create issue links via Jira REST API** (if dependencies exist)

**Method**: Use curl with Jira REST API (Rovo MCP supports this via `createJiraIssueLink` but curl is more reliable)

**Command Template**:

```bash
curl -s -X POST "https://nextgendevsolutions.atlassian.net/rest/api/3/issueLink" \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": {"name": "Blocks"},
    "inwardIssue": {"key": "{blocker_ticket}"},
    "outwardIssue": {"key": "{blocked_ticket}"}'
  }'
```

**Example** (ESNG-73 blocks ESNG-74):

```bash
curl -s -X POST "https://nextgendevsolutions.atlassian.net/rest/api/3/issueLink" \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": {"name": "Blocks"},
    "inwardIssue": {"key": "ESNG-73"},
    "outwardIssue": {"key": "ESNG-74"}}'
```

**Expected Response**: Empty (204 No Content) = success

**Common Link Types**:

- `"Blocks"` - Inward issue blocks outward issue
- `"Relates"` - Issues are related but not blocking
- `"Duplicates"` - Inward issue duplicates outward issue

**Verification**:

```bash
curl -s "https://nextgendevsolutions.atlassian.net/rest/api/3/issue/ESNG-74?fields=issuelinks" \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" | jq '.fields.issuelinks'
```

</action>

### 2.7: Design Quality Gate + Mark Ready-for-Sprint

<check if="design_sign_off[current_ticket].approved == false">
  <template-output section="blocked">
⛔ **{current_ticket} BLOCKED - Cannot mark Ready-for-Sprint**

**Reason**: Unresolved UX issues (Sally did not sign off)
**Label**: "Design-Inconsistency"
**Issues**: {{design_sign_off[current_ticket].issues.length}} documented in Jira

Ticket skipped in this refinement session.
</template-output>

<action>Skip to next ticket (do NOT proceed with label/description updates)</action>
</check>

<check if="design_sign_off[current_ticket].approved == true">
  <action>
  **Design Quality Gate PASSED** ✅

Proceeding to Gherkin AC creation and Clean Ticket verification...

  <!-- Label application moved to Step 2.7a after verification -->
  </action>
</check>

### 2.7a: Create Gherkin ACs + Delete Action Items + Verify Clean Ticket

<action>
**STEP 1: Convert Action Items to Gherkin Format**:

1. **Read current preliminary Action Items** from ticket description (created in Step 2.3)
2. **For each Action Item, create Gherkin scenario**:
   - Extract AC title and details
   - Convert to Given/When/Then format
   - **Scenario**: {AC title}
   - **Given**: {precondition}
   - **When**: {action}
   - **Then**: {expected outcome}

3. **APPEND Gherkin scenarios + DELETE preliminary ACs**:

**BMad-Master delegates to jira-manager**: Create Gherkin ACs in ADF format

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: update_description_with_gherkin

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- gherkin_content: {gherkin_scenarios_text}
- operations:
  1. APPEND heading: "## Acceptance Criteria (Gherkin)"
  2. APPEND ADF codeBlock:
     - type: "codeBlock"
     - attrs: { "language": "gherkin" }
     - content: Feature + Scenario blocks formatted as:

       ```gherkin
       Feature: {Story title}

       Scenario: {AC 1 title}
         Given {precondition}
         When {action}
         Then {expected outcome}
       ```

  3. DELETE: Remove heading "Acceptance Criteria (Preliminary)" and its taskList

**CRITICAL FORMAT RULES** (MUST enforce):

- Gherkin MUST be ADF codeBlock with attrs.language="gherkin"
- NOT wiki markup (_Scenario:, _ Given, _ When, _ Then)
- NOT {noformat} blocks
- Structure: Feature → Scenario → Given/When/Then

**Expected Return**:

- {gherkin_block_added}: true/false
- {preliminary_acs_deleted}: true/false
- {format_valid}: true/false

**Validation Gate**: ALL three flags must be true to proceed

**Why Delete Preliminary Action Items**:

- Gherkin scenarios are now the single source of truth for ACs
- Prevents duplication and confusion
- Maintains clean ticket standard
  </action>

<action>
**STEP 2: Verify Clean Ticket Standard** (8 content + 3 format checks):

**Content Checks** (existing):

1. [ ] Summary (clear, concise, <255 chars)
2. [ ] Description (all sections: Overview, Key Requirements, Technical Notes, Testing Approach)
3. [ ] ACs exist (Gherkin format: Given/When/Then)
4. [ ] Jira links (dependencies documented)
5. [ ] Confluence links (if applicable)
6. [ ] Story points (set via Agile API)
7. [ ] Labels (BE/UI/Shared/Platform + Pre-Refined)
8. [ ] Ready-for-Sprint eligibility

**Format Compliance Checks** (NEW - MANDATORY): 9. [ ] Gherkin in ADF codeBlock (attrs.language="gherkin") - NOT wiki markup 10. [ ] Preliminary ACs deleted (no "Acceptance Criteria (Preliminary)" heading) 11. [ ] Code examples in ADF codeBlock - NOT {noformat} blocks

**Verification Method**:

- BMad-Master delegates to jira-manager: fetch_description_adf
- Parse ADF structure and validate:
  - Search for node: type="codeBlock", attrs.language="gherkin" → Check 9
  - Search for heading text containing "Preliminary" → Check 10 (must NOT exist)
  - Search for "{noformat}" text in any node → Check 11 (must NOT exist)

**Verification Logic**:

- IF all 11 checks pass → Set {clean_ticket_verified} = true
- IF any check fails:
  - Set {clean_ticket_verified} = false
  - Report WHICH checks failed with specific errors:
    - "Check 9 FAILED: Gherkin uses wiki markup instead of ADF codeBlock"
    - "Check 10 FAILED: Preliminary ACs still exist in description"
    - "Check 11 FAILED: Found {noformat} blocks - must use ADF codeBlock"
  - **DO NOT apply "Ready-for-Sprint" label** (HARD GATE)
  - Document gaps in Jira comment
  - Skip to next ticket

**Critical Rule**: ONLY apply "Ready-for-Sprint" if ALL 11 checks pass
</action>

<check if="clean_ticket_verified == true">
  <action>
  **Clean Ticket Verification PASSED** ✅

**BMad-Master delegates to jira-manager**: Add "Ready-for-Sprint" label

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: editJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- fields:
  - labels: Merge existing labels with "Ready-for-Sprint"
    - Preserve: {existing_labels} (BE, Shared, Platform, UI, Pre-Refined, etc.)
    - Add: "Ready-for-Sprint"

**Expected Return**: Success confirmation

**Note**: Label applied ONLY after Gherkin ACs verified to exist
</action>
</check>

<template-output section="gherkin_acs_created">
## ✅ Gherkin ACs Created + Clean Ticket Verified

**Gherkin Scenarios Added**: {{gherkin_count}} scenarios
**Preliminary Action Items Deleted**: ✅

**Clean Ticket Checklist**:

1. {{#if summary_valid}}✅{{else}}❌{{/if}} Summary
2. {{#if description_complete}}✅{{else}}❌{{/if}} Description
3. {{#if gherkin_acs}}✅{{else}}❌{{/if}} ACs (Gherkin format)
4. {{#if jira_links}}✅{{else}}❌{{/if}} Jira links
5. {{#if confluence_links}}✅{{else}}ℹ️{{/if}} Confluence links ({{confluence_links_count}} pages)
6. {{#if story_points_set}}✅{{else}}❌{{/if}} Story points ({{story_points}} SP)
7. {{#if labels_valid}}✅{{else}}❌{{/if}} Labels
8. {{#if clean_ticket_verified}}✅{{else}}❌{{/if}} Ready-for-Sprint

{{#if clean_ticket_verified}}
✅ **CLEAN TICKET VERIFIED** - Proceeding to mark "Ready-for-Sprint"
{{else}}
❌ **TICKET INCOMPLETE** - Missing {{missing_items_count}} items:
{{#each missing_items}}

- {{this}}
  {{/each}}

**Action**: Documented gaps in Jira comment, NOT marking "Ready-for-Sprint"
{{/if}}
</template-output>

### 2.8: Reply to Mentions (if mentions found)

<check if="mentions_found[current_ticket].length > 0">
  <action>
  **BMad-Master delegates to jira-manager**: Add comment with mention responses

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: addCommentToJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- commentBody: Formatted markdown with mention responses:

```markdown
## Agent Responses to Mentions

{{#each mention_responses[current_ticket]}}
**{{this.agent_id}}** (mentioned as {{this.mention}}):

> {{this.response}}

{{/each}}

---

_Addressed during Backlog Refinement session on {date}_
```

**Expected Return**: Success confirmation
</action>

  <template-output section="mentions_replied">
✅ Posted {{mention_responses[current_ticket].length}} mention response(s) as comment on {current_ticket}
  </template-output>
</check>

<action>
**Update state.json - Mark ticket refined**:
```bash
jq '.refined_tickets += [$ticket] | .current_ticket_index += 1 | .ticket_results[$ticket] = {
  "refined": true,
  "ready_for_sprint": true,
  "mentions_addressed": $mentions_count
}' --arg ticket "{current_ticket}" \
   --argjson mentions_count '{{mentions_found[current_ticket].length}}' \
   "{state_file}" > "{state_file}.tmp" && mv "{state_file}.tmp" "{state_file}"
```
</action>

<template-output section="ticket_complete">
✅ **{current_ticket}** refined successfully!
- Acceptance criteria: ✅
- Technical notes: ✅
- Testing approach: ✅
- Dependencies documented: ✅
- **UX validation: ✅ (Sally signed off)**
- **Design consistency: ✅ (Cross-story validated)**
- **Design assets: {{#if ux_fixes_applied[current_ticket]}}✅ Updated by Sally{else}✅ Verified{{/if}}**
- Ready-for-Sprint: ✅

**Progress:** {{@index + 1}}/{{selected_tickets.length}} tickets refined
</template-output>

### 2.9: Cleanup Cached Tickets

<check if="cached_ticket_folders is not empty">
<action>
**Remove Cached Ticket Folders**:

For each folder in {cached_ticket_folders}:

- Execute: rm -rf {cached_folder_path}
- Log: "Cleaned up cached ticket folder: {cached_folder_path}"

Clear {cached_ticket_folders} array
</action>

<template-output section="cleanup_complete">
## 🧹 Cleanup Complete

Removed {{cached_folder_count}} cached ticket folders.
</template-output>
</check>

</for-each>

</step>

---

<step n="3" goal="Refinement Complete">

<action>Communicate in {communication_language} with {user_name}</action>

<template-output section="summary">
# Backlog Refinement Complete! 🎯

## Refined {{selected_tickets.length}} Tickets

{{#each selected_tickets}}

- [{this}](https://nextgendevsolutions.atlassian.net/browse/{this}) - Ready for Sprint ✅
  - Refinement Path: 📋 Full Refinement (Deep validation)
    {{#if design_sign_off[this].issues_fixed}}
  - UX Issues Fixed: {{design_sign_off[this].issues_fixed.length}}
    {{/if}}
    {{/each}}

{{#if design_blocked_tickets.length > 0}}

## ⛔ Blocked Tickets (Design Issues)

{{#each design_blocked_tickets}}

- [{this}](https://nextgendevsolutions.atlassian.net/browse/{this}) - Design-Inconsistency ⛔
  - Issues: {{design_sign_off[this].issues.length}} (see Jira comments)
    {{/each}}

**Action Required**: Resolve design issues before including in sprint
{{/if}}

{{#if ux_fixes_applied.length > 0}}

## 🎨 Design Improvements

Sally fixed UX issues during refinement:
{{#each ux_fixes_applied}}

- {{this.ticket}}: {{this.issues_fixed}} issues fixed
  - Files updated: {{this.files_updated.join(', ')}}
  - Git commit: {{this.commit_hash}}
    {{/each}}
    {{/if}}

All tickets (except blocked) are now ready for sprint planning!
</template-output>

<action>
**Mark workflow complete and cleanup state**:
```bash
# Update state to completed
jq '.status = "completed" | .completed_at = "'"$(date -Iseconds)"'"' \
  "{state_file}" > "{state_file}.tmp" && mv "{state_file}.tmp" "{state_file}"

# Optionally: Delete state folder after successful completion

# rm -rf "{state_dir}"

```
</action>

</step>

</workflow>
```
