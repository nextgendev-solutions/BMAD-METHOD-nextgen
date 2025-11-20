<workflow>

<critical>Communicate in {communication_language} throughout the workflow</critical>

# Pre-Refinement Workflow Instructions

**Purpose:** Interactive epic-based pre-refinement with Product Owner participation to prepare tickets for backlog refinement

---

## Recovery Protocol

<check if="state_file_exists">
  <action>Load state → Verify pre-refined tickets in Jira → Prompt user to resume</action>
</check>

---

<step n="1" goal="Determine Input Type">

<action>Communicate in {communication_language} with {user_name}</action>

<ask>Input type: Epic-based or Manual ticket selection? (epic/manual):</ask>

<action>Store in {input_type}</action>

<note>Save state: input_type</note>

</step>

---

<step n="2A" goal="Epic-Based Flow (if input_type == epic)">

<action>Communicate in {communication_language} with {user_name}</action>

### 2A.1: Get Epic Key

<ask>Enter Epic key (e.g., ESNG-10):</ask>

<action>Store in {epic_key}</action>

### 2A.2: Fetch Epic from Jira

<action>
**BMad-Master delegates to jira-manager**: Fetch epic details

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: getJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{epic_key}"

**Expected Return**: Epic summary, description, status, labels, priority

Store results in: {epic_summary}, {epic_description}, {epic_status}
</action>

### 2A.3: Smart Confluence Fetching

<action>
Parse {epic_description} for Confluence links (URLs containing `/wiki/spaces/` or `/wiki/pages/`)

If Confluence links found → Extract page IDs → Store in {confluence_links}
</action>

<check if="confluence_links.length > 0">
  <action>
  **BMad-Master delegates to confluence-manager**: Auto-fetch Confluence pages

**Agent**: confluence-manager (BMad built-in)

**Operation**: getConfluencePage (for each link)

**Parameters**:

- cloudId: "{jira_cloud_id}"
- pageId: "{extracted_page_id}"

**Expected Return**: Page content in Markdown format

Store results in: {confluence_docs}
</action>
</check>

<check if="confluence_links.length == 0">
  <ask>No Confluence links found in epic. Please provide Confluence page URL for this epic (or press Enter to skip):</ask>

  <check if="user_provided_link">
    <action>
    Extract page ID from user-provided URL

    **BMad-Master delegates to confluence-manager**: Fetch page

    **Agent**: confluence-manager (BMad built-in)

    **Operation**: getConfluencePage

    **Parameters**:
    - cloudId: "{jira_cloud_id}"
    - pageId: "{extracted_page_id}"

    **Expected Return**: Page content in Markdown format

    Store results in: {confluence_docs}
    </action>

  </check>
</check>

<note>Save state: epic_key, epic_description, confluence_docs</note>

</step>

---

<step n="3" goal="Epic Review Phase (Interactive Party-Mode)">

<action>Communicate in {communication_language} with {user_name}</action>

**Duration**: 30-45 minutes

<template-output section="epic_review_start">
## 🎭 Epic Review Phase: {epic_key}

**Epic Summary**: {epic_summary}

**Confluence Pages Fetched**: {{confluence_docs.length}}
{{#each confluence_docs}}

- {{this.title}}
  {{/each}}

**Starting interactive epic review discussion...**
</template-output>

### 3.1: Epic Review Party-Mode Discussion

<action>
Execute party-mode epic review session:

**Context for Party-Mode**:

- Epic: {epic_key}
- Summary: {epic_summary}
- Description: {epic_description}
- Confluence Context: {confluence_docs}

**Session Type**: Epic Review (Pre-Refinement)

**Required Participants**: ALL project agents

- Product Owner (KA) - **ACTIVE PARTICIPANT**
- Product Manager - Asks PO about business value, validates scope
- Architect - Reviews technical constraints, architecture alignment
- Backend Dev (spring-webflux-kotlin-dev) - Identifies technical implications
- KMP Dev (kmp-flow-dev) - Identifies shared/UI implications
- Code Reviewer - Identifies architectural concerns
- QA - Identifies quality requirements
- **UX Expert (Sally - bmad:bmm:agents:ux-exprt) - Validates UX, manages design assets**
- Scrum Master (facilitates session)

**Discussion Topics**:

1. Epic Vision & Business Goals (Product Owner presents)
2. Confluence Documentation Review (All agents review together)
3. Scope Validation (Product Manager leads, PO confirms)
4. Technical Constraints (Architect leads, PO clarifies)
5. Quality Requirements (QA leads, PO confirms)
6. Success Criteria (Product Manager + QA validate with PO)

**Required Output**:

- Product Owner validation: "Does this epic align with your requirements?"
- Agents identify any misalignment or gaps
- Consensus on epic scope understanding
  </action>

### 3.2: Epic Validation Decision (Product Owner)

<ask>Based on the epic description and Confluence docs, does this epic align with your requirements and vision? (yes/no):</ask>

<action>Store in {epic_validated}</action>

<note>Save state: epic_validated</note>

### 3.3: Epic Misalignment Resolution (if epic_validated == false)

<check if="epic_validated == false">
  <template-output section="epic_misaligned">
## ❌ Epic Misaligned

The epic doesn't match your vision. Let's adjust the requirements interactively.
</template-output>

<ask>Please provide the high-level requirements you need:</ask>

<action>Store in {corrected_requirements}</action>

**🎭 HIGHLY INTERACTIVE Discussion** (10-15 min) - **Multi-Round Back-and-Forth**:

**Round 1 - Agent Initial Review**:
<action>
Execute party-mode requirements feasibility review:

**Context**:

- Original Epic: {epic_description}
- Corrected Requirements: {corrected_requirements}

**Agents Ask Product Owner**:

- Architect → PO: "These requirements need [technical constraint] - can we adjust scope to [suggestion]?"
- Backend Dev → PO: "Implementation requires [X] - is that acceptable?"
- KMP Dev → PO: "This affects shared module [Y] - should we include that in scope?"
- QA → PO: "To test this we need [Z] - can you clarify [edge case]?"
- Product Manager → PO: "Scope boundary unclear for [feature] - what's IN vs OUT?"

**Product Owner responds to each question**
</action>

<ask>Based on agent questions, do you want to adjust your requirements? If yes, provide adjusted requirements. If no, type "no changes":</ask>

  <action>
  If user provided adjusted requirements → Update {corrected_requirements}
  Store PO clarifications in {{po_decisions.epic_adjustment}}
  </action>

**Round 2 - Agents Validate Adjusted Requirements**:
<action>
Agents review adjusted requirements, confirm feasibility

If more clarification needed → Loop back to PO
</action>

  <check if="more_clarification_needed">
    <ask>Agents need more clarification on: [specific questions]. Please clarify:</ask>
    <action>Update {corrected_requirements} with PO's clarification</action>
  </check>

**Round 3 - Final Alignment**:
<action>
All agents confirm requirements are clear and feasible
BMad Master summarizes final adjusted requirements
</action>

<ask>Do you approve these final adjusted requirements? (yes/no):</ask>

  <check if="user_response == 'yes'">
    <action>
    **BMad-Master delegates to confluence-manager**: Update Confluence page

    **Agent**: confluence-manager (BMad built-in)

    **Operation**: updateConfluencePage

    **Parameters**:
    - cloudId: "{jira_cloud_id}"
    - pageId: "{confluence_page_id}"
    - body: Updated requirements in Markdown format

    **Expected Return**: Success confirmation
    </action>

    <action>
    **BMad-Master delegates to jira-manager**: Update Epic description

    **Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

    **Operation**: editJiraIssue

    **Parameters**:
    - cloudId: "{jira_cloud_id}"
    - issueIdOrKey: "{epic_key}"
    - fields:
      - description: Updated epic description with corrected requirements

    **Expected Return**: Success confirmation
    </action>

    <action>Set {epic_adjusted} = true</action>
    <action>Set {epic_validated} = true</action>

    <note>Save state: epic_adjusted, epic_validated, corrected_requirements</note>

    <template-output section="epic_adjusted">

## ✅ Epic Requirements Updated!

Confluence page and Jira epic updated with new requirements.

Ready to proceed with child ticket alignment.
</template-output>
</check>
</check>

</step>

---

<step n="4" goal="List Child Tickets (Epic-Based Only)">

<action>Communicate in {communication_language} with {user_name}</action>

<check if="input_type == 'epic' AND epic_validated == true">
  <action>
  **BMad-Master delegates to jira-manager**: List child tickets under epic

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: searchJiraIssuesUsingJql

**Parameters**:

- cloudId: "{jira_cloud_id}"
- jql: "parent={epic_key} AND labels NOT IN (\"Pre-Refined\") ORDER BY priority DESC, created ASC"
- maxResults: 50

**Expected Return**: Array of child ticket objects with keys, summaries, priorities, statuses

Store results in: {child_tickets}
</action>

  <template-output section="child_tickets">
## Child Tickets for {epic_key}

Found {{child_tickets.length}} child tickets:

{{#each child_tickets}}
{{@index}}. **{{this.key}}**: {{this.summary}}

- Priority: {{this.priority}}
- Status: {{this.status}}
  {{/each}}
  </template-output>

<note>Save state: child_tickets</note>
</check>

</step>

---

<step n="5" goal="Validate Ticket-Epic Alignment (Epic-Based Only)">

<action>Communicate in {communication_language} with {user_name}</action>

**Duration**: 5-10 minutes

<check if="input_type == 'epic'">
  <ask>Do these child tickets still match the epic scope? (yes/no):</ask>

<action>Store in {tickets_aligned}</action>

  <check if="tickets_aligned == false">
    <template-output section="ticket_alignment">
## ⚠️ Ticket-Epic Alignment Needed

Let's align the child tickets with the (possibly adjusted) epic requirements.

**Options**:

- Cancel tickets no longer needed
- Update ticket descriptions to match new scope
- Create missing tickets for new requirements
  </template-output>

  <ask>List tickets to CANCEL (comma-separated keys, or press Enter to skip):</ask>
  <action>
  Parse keys → Store in {tickets_to_cancel}

  For each ticket in {tickets_to_cancel}:
  **BMad-Master delegates to jira-manager**: Cancel ticket

      **Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

      **Operation**: transitionJiraIssue

      **Parameters**:
      - cloudId: "{jira_cloud_id}"
      - issueIdOrKey: "{ticket_key}"
      - transition: { id: "{cancelled_transition_id}" }

      Then add comment with reason:
      **Operation**: addCommentToJiraIssue
      **Parameters**:
      - cloudId: "{jira_cloud_id}"
      - issueIdOrKey: "{ticket_key}"
      - commentBody: "Cancelled during pre-refinement - no longer matches epic scope after requirements adjustment"

  Store cancelled tickets in {tickets_cancelled}
  </action>

  <ask>List tickets to UPDATE with new descriptions (format: KEY:new description, separated by semicolons, or press Enter to skip):</ask>
  <action>
  Parse input → Store in {tickets_to_update}

  For each ticket in {tickets_to_update}:
  **BMad-Master delegates to jira-manager**: Update ticket description

      **Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

      **Operation**: editJiraIssue

      **Parameters**:
      - cloudId: "{jira_cloud_id}"
      - issueIdOrKey: "{ticket_key}"
      - fields:
        - summary: "{new_summary}"
        - description: "{new_description}"

  Store updated tickets in {tickets_updated}
  </action>

  <ask>List NEW tickets to CREATE (format: Summary:description, separated by semicolons, or press Enter to skip):</ask>
  <action>
  Parse input → Store in {tickets_to_create}

  For each ticket in {tickets_to_create}:
  **BMad-Master delegates to jira-manager**: Create new ticket under epic

      **Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

      **Operation**: createJiraIssue

      **Parameters**:
      - cloudId: "{jira_cloud_id}"
      - projectKey: "{jira_project_key}"
      - issueTypeName: "Story"
      - summary: "{ticket_summary}"
      - description: "{ticket_description}\n\n**Created during pre-refinement to fill gap in epic scope**"
      - additional_fields:
        - parent: "{epic_key}"

  Store created tickets in {tickets_created}
  </action>

    <template-output section="alignment_complete">

## ✅ Tickets Aligned with Epic

**Cancelled**: {{tickets_cancelled.length}} tickets
{{#each tickets_cancelled}}

- {this}
  {{/each}}

**Updated**: {{tickets_updated.length}} tickets
{{#each tickets_updated}}

- {this}
  {{/each}}

**Created**: {{tickets_created.length}} tickets
{{#each tickets_created}}

- {this}
  {{/each}}

Proceeding with aligned ticket set...
</template-output>

    <action>
    Re-fetch child tickets after alignment:
    **BMad-Master delegates to jira-manager**: searchJiraIssuesUsingJql
    **Parameters**:
    - jql: "parent={epic_key} AND status != Cancelled AND labels NOT IN (\"Pre-Refined\") ORDER BY priority DESC"

    Store updated list in {child_tickets}
    </action>

    <note>Save state: tickets_aligned, tickets_cancelled, tickets_updated, tickets_created, child_tickets</note>

  </check>
</check>

</step>

---

<step n="2B" goal="Manual Ticket Selection (if input_type == manual)">

<action>Communicate in {communication_language} with {user_name}</action>

<check if="input_type == 'manual'">
  <ask>Enter ticket keys to refine (comma-separated, e.g., ESNG-42,ESNG-43):</ask>

  <action>
  Parse keys → Store in {manual_ticket_keys}

**BMad-Master delegates to jira-manager**: Fetch each ticket

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: getJiraIssue (for each key)

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{ticket_key}"

Store results in {selected_tickets}
</action>

<note>Save state: manual_ticket_keys, selected_tickets</note>
</check>

</step>

---

<step n="5A" goal="UI/UX Design Validation (MANDATORY for ALL Stories)">

<action>Communicate in {communication_language} with {user_name}</action>

**Duration**: 5-20 minutes (varies by story type)

<action>
**BMad-Master delegates to ux-exprt (Sally)**: Validate UX and manage design assets **ONLY IF REQUIRED**

**Agent**: bmad:bmm:agents:ux-exprt

**Sally's Workflow by Story Type**:

### For Stories with "Screen", "Interface", "View", "Modal", "Dialog", "Form", "Button", "Menu" in Title:

**DEEP REVIEW WITH CONDITIONAL DESIGN ASSET MANAGEMENT** (15-20 min):

**Step 1: Search for Existing Designs**

- Search `docs/design/wireframes-*.md` for story (grep by screen name)
- Search `docs/design/prototypes/` for related prototype files
- Check `docs/design/design-system.md` for component specs

**Step 2A: IF DESIGNS EXIST** ✅

1. Locate wireframe file and line numbers (e.g., `wireframes-authentication.md:50-152`)
2. Locate prototype file (e.g., `auth-login.html`)
3. Extract component specifications:
   - Dimensions (dp values)
   - Typography (sp values, type scale)
   - Spacing (dp increments)
   - Colors (Material3 tokens)
   - All interactive states (default, loading, error, success)
4. Validate Material3 compliance
5. Validate accessibility (touch targets ≥48dp, color contrast)
6. **Playwright Prototype Validation** (IF prototype file exists):
   <action>
   **Use Playwright MCP to validate prototype implementation**:

   **Step 6a: Navigate to Prototype**
   - Use `mcp__MCP_DOCKER__browser_browser_navigate` to open prototype HTML file (file:// URL)
   - Wait for page load with `mcp__MCP_DOCKER__browser_browser_wait_for`

   **Step 6b: Interactive Validation**
   - Use `mcp__MCP_DOCKER__browser_browser_snapshot` to get accessibility tree
   - Use `mcp__MCP_DOCKER__browser_browser_click` to test button interactions
   - Navigate through states (default → hover → pressed → loading → error → success)
   - Verify state transitions work as documented

   **Step 6c: Measurements via JavaScript**
   - Use `mcp__MCP_DOCKER__browser_browser_evaluate` to measure:
     ```javascript
     // Touch target validation
     document.querySelectorAll('button, a, input').forEach((el) => {
       const rect = el.getBoundingClientRect();
       const isValid = rect.width >= 48 && rect.height >= 48;
       console.log(`${el.tagName}: ${rect.width}x${rect.height} - ${isValid ? 'PASS' : 'FAIL'}`);
     });
     ```
   - Check Material3 token usage:
     ```javascript
     // Verify CSS custom properties (Material3 tokens)
     const computedStyle = getComputedStyle(document.documentElement);
     const primaryColor = computedStyle.getPropertyValue('--md-sys-color-primary');
     console.log('Material3 tokens:', primaryColor ? 'FOUND' : 'MISSING');
     ```
   - Validate 8dp grid spacing:
     ```javascript
     // Check if all margins/padding are divisible by 8
     document.querySelectorAll('*').forEach((el) => {
       const style = getComputedStyle(el);
       const margins = [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft];
       margins.forEach((m, i) => {
         const px = parseInt(m);
         if (px % 8 !== 0) console.log(`${el.tagName}: margin ${i} = ${px}px (NOT 8dp aligned)`);
       });
     });
     ```

   **Step 6d: Capture Screenshot from Prototype**
   - Use `mcp__MCP_DOCKER__browser_browser_take_screenshot` to capture screenshot from rendered UI
   - Save to: `.playwright-mcp/{current_ticket}-prototype.png`
   - Store result in {{playwright_screenshots_captured[current_ticket]}}

   **Step 6e: Validation Results**
   - Store validation results in {{prototype_validation_results[current_ticket]}}:
     ```
     {
       touch_targets_valid: boolean,
       material3_tokens_valid: boolean,
       grid_spacing_valid: boolean,
       issues: [
         {type: "touch_target", element: "button.submit", actual: "40x40", required: "48x48"},
         {type: "hardcoded_color", element: ".header", actual: "#1976D2", required: "var(--md-sys-color-primary)"},
         ...
       ]
     }
     ```

   **IF validation issues found**:
   - Report to Product Owner: "Prototype has {{issues.length}} issues. Fix now or mark Design-Pending?"
   - IF fix approved: Update prototype HTML, re-run validation
   - IF fix declined: Add "Design-Inconsistency" label, proceed
     </action>

7. **Take screenshot** of wireframe section (fallback if no prototype)
8. **Attach screenshot to Jira ticket** via jira-manager (use Playwright screenshot if available)
9. **Add to Jira description**:
   - Wireframe file path and line numbers
   - Prototype file path
   - Component specs table
   - Git links to design files
10. **Update Confluence design page** via confluence-manager (add reference to this story)

**Step 2B: IF DESIGNS MISSING (Gap Found)** ⚠️ **CREATE ONLY IF REQUIRED**

1. **Ask Product Owner**: "Design assets missing for this story. Should Sally create new wireframe/prototype? (yes/no)"
2. **IF PO APPROVES CREATION**:
   - **Create wireframe section** in appropriate `docs/design/wireframes-*.md` file
   - **Create prototype** (HTML file in `docs/design/prototypes/`) if needed
   - **Document component specs** (dimensions, typography, spacing, colors, states)
   - **Commit to Git** via git-manager:
     ```
     git add docs/design/wireframes-*.md docs/design/prototypes/*.html
     git commit -m "feat(design): Add wireframes/prototype for [STORY-KEY]"
     git push
     ```
   - **Take screenshot** of new wireframe
   - **Attach screenshot to Jira ticket** via jira-manager
   - **Add to Jira description** (wireframe lines, prototype path, specs, Git links)
   - **Update Confluence design page** via confluence-manager
   - **Add comment to Jira**: "New designs created and committed to docs/design/"
3. **IF PO DECLINES CREATION**:
   - **Add Jira comment**: "Design assets pending - to be created later"
   - **Add label**: "Design-Pending"
   - **Continue with refinement** (story can proceed without designs for now)

**Quality Checklist (Sally verifies - IF designs exist or created)**:

- [ ] Wireframe file and line numbers documented
- [ ] Prototype file referenced (if applicable)
- [ ] Component dimension table in Jira description
- [ ] Typography specifications documented
- [ ] Spacing specifications documented
- [ ] Color token references documented
- [ ] All interactive states documented
- [ ] Screenshot attached to Jira ticket
- [ ] Git links added to Jira description
- [ ] Confluence design page updated
- [ ] Material3 compliance verified
- [ ] Accessibility validated
- [ ] **If new designs created**: Committed to Git

### For BE/Shared/Platform Stories (No Screen in Title):

**LIGHT REVIEW** (5 min):

1. Review user-facing aspects:
   - API error messages (clear, actionable?)
   - Response structures (consistent, predictable?)
   - Loading states (communicated to UI?)
   - Edge cases (documented for UX handling?)
2. Identify if story affects user experience
3. Note any UX considerations in Jira description
4. **NO design assets needed** (unless story describes user-visible error/state)

**Sally's Questions to PO**:

- "How does this affect the user experience?"
- "What error messages should users see?"
- "Are there loading states the UI needs to handle?"
- "What edge cases impact user flow?"
- "Do we need wireframes for error states?"

**Agent Delegation**:

- **jira-manager**: Attach screenshot, update Jira description, add comments/labels
- **confluence-manager**: Update Confluence design page
- **git-manager**: Commit new design files (ONLY if created and approved by PO)
  </action>

<note>Save state: sally_review_complete, design_assets_attached, confluence_updated, git_committed, design_creation_approved</note>

</step>

---

<step n="6" goal="Ticket Selection for Refinement">

<action>Communicate in {communication_language} with {user_name}</action>

<check if="input_type == 'epic'">
  <template-output section="ticket_selection">
## Select Tickets to Refine

{{#each child_tickets}}
{{@index}}. **{{this.key}}**: {{this.summary}}

- Priority: {{this.priority}}
- Status: {{this.status}}
  {{/each}}

Select tickets to refine in this session (comma-separated numbers):
</template-output>

<ask>Enter ticket numbers:</ask>

<action>Parse → Map to actual tickets → Store in {selected_tickets}</action>

<note>Save state: selected_tickets</note>
</check>

</step>

---

<step n="7" goal="Refine Each Ticket (Interactive Multi-Round)">

<action>Communicate in {communication_language} with {user_name}</action>

<for-each ticket in selected_tickets>

<action>Set {current_ticket_index} = {{@index}}</action>

<template-output section="ticket_start">
## 📝 Refining Ticket {{@index + 1}}/{{selected_tickets.length}}: {{current_ticket.key}}

**Summary**: {{current_ticket.summary}}
**Priority**: {{current_ticket.priority}}
**Status**: {{current_ticket.status}}
</template-output>

### 7.1: Fetch Ticket Details and Confluence Docs

<action>
**BMad-Master delegates to jira-manager**: Fetch complete ticket details

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: getJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"

**Expected Return**: Complete ticket object with description, status, labels, priority

Store results in: {ticket_summary}, {ticket_description}, {ticket_labels}
</action>

<action>
Parse {ticket_description} for Confluence links

If links found → Fetch pages using confluence-manager (same pattern as epic)
Store in {ticket_confluence_docs}
</action>

### 7.1a: Parse @Mentions from Jira (NEW)

<action>
**BMad-Master delegates to jira-manager**: Parse @mentions from ticket

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: parseMentions

**Input**:

- Ticket Key: {current_ticket}
- Description: {ticket_description}
- Footer Comments: Fetch via getConfluencePageFooterComments or Jira API

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

### 7.1b: Examine Existing Codebase (Technical Context Discovery)

<action>
**BMad-Master delegates to developer agent**: Search codebase for existing implementations

**Agent Selection**:

- If {ticket_labels} contains "BE" → delegate to spring-webflux-kotlin-dev
- If {ticket_labels} contains "Shared" or "Platform" or "UI" → delegate to kmp-flow-dev
- Default → kmp-flow-dev

**Agent**: spring-webflux-kotlin-dev OR kmp-flow-dev (based on label)

**Task**: Examine existing codebase for reusable components and patterns

**Module-Specific Search Scopes** (MANDATORY - see docs/architecture/coding-standards.md#codebase-search-scope):

<check if="current_module == 'composeApp'">
**Working on :composeApp**
→ **Search Order**: :composeApp → :shared → :services
→ **Rationale**: UI layer depends on shared business logic and may reuse backend infrastructure

**Search Patterns**:

1. **Extract feature name from ticket**:
   - Parse {ticket_summary} for key nouns (e.g., "Email Validation" → "Email", "Validator")
   - Example: "Add user profile screen" → "Profile", "User", "Screen"

2. **Search composeApp first**:

   ```bash
   Glob: composeApp/src/**/*{FeatureName}*.kt
   Grep: {FeatureName} in composeApp/src/
   ```

3. **Search shared for business logic**:

   ```bash
   Glob: shared/src/**/*{FeatureName}*.kt
   Grep: {FeatureName} in shared/src/
   ```

4. **Search services for backend patterns**:
   ```bash
   Glob: services/src/**/*{FeatureName}*.kt
   Grep: {FeatureName} in services/src/
   ```
   </check>

<check if="current_module == 'shared'">
**Working on :shared**
→ **Search Order**: :shared → :services
→ **Rationale**: Platform-agnostic layer may leverage backend utilities

**Search Patterns**:

1. **Extract feature name from ticket** (same as above)

2. **Search shared first**:

   ```bash
   Glob: shared/src/**/*{FeatureName}*.kt
   Grep: {FeatureName} in shared/src/
   ```

3. **Search services for reusable utilities**:
   ```bash
   Glob: services/src/**/*{FeatureName}*.kt
   Grep: {FeatureName} in services/src/
   ```
   </check>

<check if="current_module == 'services'">
**Working on :services**
→ **Search Order**: :services only
→ **Rationale**: Backend is independent with no KMP dependencies

**Search Patterns**:

1. **Extract feature name from ticket** (same as above)

2. **Search services**:
   ```bash
   Glob: services/src/**/*{FeatureName}*.kt
   Grep: {FeatureName} in services/src/
   ```
   </check>

**What to Find**:

1. **Similar Features**: Existing implementations of similar functionality
2. **Reusable Components**: Utilities, helpers, base classes
3. **Existing Patterns**: Coding patterns to follow for consistency

**Store Results** (in workflow state):

- {{existing_implementations[current_ticket]}} = Array of file paths found
- {{reusable_components[current_ticket]}} = Components that can be reused
- {{patterns_found[current_ticket]}} = Coding patterns to follow

**Expected Return Format**:

```
Codebase Search Results for "{{current_ticket.summary}}":
✅ Found: {module}/src/{path}/{FileName}.kt
✅ Found: {module}/src/{path}/{ComponentName}.kt
→ Decision: Reuse {ComponentName} from {module}
→ Implementation: Import and extend existing component

OR

No existing implementation found - building from scratch
→ Will follow existing patterns from similar features
```

</action>

<check if="existing_implementations[current_ticket].length > 0">
  <template-output section="codebase_findings">
## 🔍 Existing Code Found for {{current_ticket.key}}

Found {{existing_implementations[current_ticket].length}} existing implementation(s):

{{#each existing_implementations[current_ticket]}}
{{@index + 1}}. **{{this.file_path}}**

- Type: {{this.component_type}} (e.g., ViewModel, Repository, Utility)
- Reusable: {{this.reusable}} (Yes/No)
- Pattern: {{this.pattern_description}}
  {{/each}}

**Reuse Strategy**:
{{#each reusable_components[current_ticket]}}

- Import {{this.component_name}} from {{this.module}}
- Extend/Compose as needed for new feature
  {{/each}}
  </template-output>
  </check>

<check if="existing_implementations[current_ticket].length == 0">
  <template-output section="no_codebase_findings">
## 🔍 No Existing Code Found for {{current_ticket.key}}

- Searched modules: {searched_modules}
- Building from scratch
- Will follow existing patterns from similar features (if any found)
  </template-output>
  </check>

### 7.2: Party-Mode Discussion Round 1 - Initial Assessment (5-10 min)

<action>
Execute party-mode ticket refinement session:

**Context**:

- Ticket: {{current_ticket.key}}
- Summary: {ticket_summary}
- Description: {ticket_description}
- Confluence Context: {ticket_confluence_docs}
- Epic Context: {epic_description} (if epic-based)
- **🔔 Agent Mentions**: {{mentions_found[current_ticket]}}

**Mention Handling** (NEW):
{{#each mentions_found[current_ticket]}}

- **{{this.agent_id}}**: You were mentioned in {{this.source}}:

  > "{{this.context}}"

  Please address this mention during the discussion.
  {{/each}}

**Product Owner (KA) - ACTIVE PARTICIPANT**:

- Clarifies business context
- Answers agent questions

**Discussion Topics**:
{{#if mentions_found[current_ticket].length > 0}} 0. **🔔 Address Mentions FIRST** (Mentioned agents respond)
{{/if}}

1. Product Manager → KA: "What's the primary business goal for this ticket?"
2. Architect → KA: "Are there system constraints we should know about?"
3. QA → KA: "What are the critical success criteria?"
4. Scrum Master → KA: "Who is the target user persona?"
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

### 7.3: Party-Mode Discussion Round 2 - Deep Dive (10-15 min)

<action>
**Agents Propose**, **Product Owner (KA) Reviews and Approves**:

1. Product Manager proposes user story format
2. All Agents discuss and propose 3-5 acceptance criteria
3. Backend Dev + KMP Dev propose high-level technical approach **BASED ON CODEBASE FINDINGS**:
   - **Reference existing implementations** from {{existing_implementations[current_ticket]}}
   - **Propose reuse strategy** for {{reusable_components[current_ticket]}}
   - **Follow patterns** from {{patterns_found[current_ticket]}}
   - Example: "Found existing EmailValidator in shared/src/util/ - will reuse and extend for this feature"
4. Architect validates approach
5. **Sally (UX Expert) proposes UX specifications and design assets**:
   - For Screen stories: Wireframe line references, component specs, screenshot attached to Jira
   - For BE/Shared stories: Error messages, loading states, edge cases
   - Confirms design assets in Jira (screenshot + Git links) OR explains if pending creation
   - Confirms Confluence design page updated
6. QA proposes preliminary testing strategy
7. All Agents identify dependencies and blockers
8. Confluence Manager lists identified related Confluence pages

**Product Owner (KA)**:

- Reviews each proposal
- Approves or requests changes
- **Reviews Sally's design assets** (screenshot in Jira, wireframe quality, component specs)
- Confirms dependencies
- Confirms which Confluence docs are relevant
  </action>

<ask>Do you approve the proposed details for {{current_ticket.key}}? (yes/no):</ask>

<check if="user_response == 'no'">
  <ask>What needs to change? Provide feedback:</ask>
  <action>Store feedback → Loop back to Round 2 with adjustments</action>
</check>

### 7.4: Party-Mode Discussion Round 3 - Finalization & Priority (5 min)

<action>
BMad Master summarizes:
- Business context (from PO)
- Acceptance criteria (PO approved)
- Preliminary technical notes
- Dependencies (PO confirmed)
- Confluence docs (PO confirmed)
</action>

<ask>Should we adjust the priority for {{current_ticket.key}}? Current: {current_priority}. Enter new priority (High/Medium/Low) or press Enter to keep current:</ask>

<action>
If priority changed:
  Store in {priority_changes}

**BMad-Master delegates to jira-manager**: Update priority

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: editJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- fields: - priority: { name: "{new_priority}" }
  </action>

### 7.5: Update Ticket with Pre-Refined Details

<action>
**STEP 1: Update non-AC sections (markdown format)**

**BMad-Master delegates to jira-manager**: Update ticket with business context and design reference

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: editJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- fields:
  - description: Formatted markdown with:
    - {original_description}
    - Separator: "---"
    - Section: "## Business Context" + {business_context}
    - Section: "## Design Reference" + {design_assets} (IF Screen story with designs):

      ```markdown
      ## Design Reference

      **Screenshot**: See attachment `wireframe-{story_key}.png`

      **Wireframe**: `docs/design/wireframes-[file].md:[line-start]-[line-end]` ([Screen Name])

      - Component specs: dimensions, typography, spacing, colors
      - Interactive states with line references (default, loading, error, success)

      **Prototype**: `docs/design/prototypes/[file].html` (if applicable)

      **Material3 Compliance**: ✅ Verified by Sally
      **Accessibility**: ✅ Validated by Sally (touch targets ≥48dp, color contrast)

      **Confluence**: [Design Specifications](confluence-link)

      **Status**: ✅ Designs exist | ⚠️ Design-Pending (to be created later)
      ```

    - Section: "## Preliminary Technical Notes" + {technical_notes}
    - Section: "## Related Documentation" + {confluence_links}
    - Section: "## Dependencies" + {dependencies}
    - Section: "## Pre-Refinement Session Notes" + session metadata

**Expected Return**: Success confirmation
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

Append to existing description (do not replace). Use ADF taskList/taskItem structure."

**Pass to jira-manager**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- ac_items: {acceptance_criteria} (array of text items from pre-refinement session)

**Expected Return**: Success confirmation with number of AC items created

**Implementation Note**: jira-manager will:

1. Fetch current description ADF via REST API
2. Parse existing content array
3. Add heading: {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Acceptance Criteria (Preliminary)"}]}
4. Add taskList with proper localId naming (ac-1, ac-2, ..., ac-N)
5. PUT updated ADF back to ticket
6. Verify Action Items appear in Jira UI

**Note**: These are preliminary AC - may be refined further during backlog refinement
</action>

### 7.6: Create Issue Links for Dependencies (if applicable)

<check if="dependencies.length > 0">
  <action>
  **Create issue links via Jira REST API** (if blocking dependencies identified)

**Method**: Use curl with Jira REST API (Rovo MCP supports this but curl is more reliable)

**Command Template**:

```bash
curl -s -X POST "https://nextgendevsolutions.atlassian.net/rest/api/3/issueLink" \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": {"name": "Blocks"},
    "inwardIssue": {"key": "{blocker_ticket}"},
    "outwardIssue": {"key": "{current_ticket}"}'
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

- `"Blocks"` - Inward issue blocks outward issue (use when identifying blockers)
- `"Relates"` - Issues are related but not blocking
- `"Duplicates"` - Inward issue duplicates outward issue

**Verification**:

```bash
curl -s "https://nextgendevsolutions.atlassian.net/rest/api/3/issue/{current_ticket}?fields=issuelinks" \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" | jq '.fields.issuelinks'
```

**Note**: Issue links are typically created during backlog refinement, but can be created during pre-refinement if blocking dependencies are already known.
</action>
</check>

### 7.7: Add Pre-Refined Label

<action>
**BMad-Master delegates to jira-manager**: Add "Pre-Refined" label

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: editJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- fields:
  - labels: Merge existing labels with "Pre-Refined"

**Note**: jira-manager will fetch current labels, merge with new label, and update
</action>

### 7.8: Reply to Mentions (if mentions found)

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

_Addressed during Pre-Refinement session on {date}_
```

**Expected Return**: Success confirmation
</action>

  <template-output section="mentions_replied">
✅ Posted {{mention_responses[current_ticket].length}} mention response(s) as comment on {current_ticket}
  </template-output>
</check>

<note>
Mark {current_ticket} refined.
Save state: refined_tickets[current_ticket] = {
  pre_refined: true,
  priority_changed: {priority_changed},
  business_context: {business_context},
  po_decisions: {po_decisions},
  mentions_addressed: {{mentions_found[current_ticket].length}}
}

Save state: mentions_found, mention_responses
</note>

<template-output section="ticket_complete">
✅ **{{current_ticket.key}}** pre-refined successfully!
- Business context: ✅
- Acceptance criteria: ✅ (PO approved)
- Design assets: {{#if design_assets_attached}}✅ Screenshot attached, wireframes linked{else}⚠️ Design-Pending{{/if}}
- Preliminary technical notes: ✅
- Dependencies documented: ✅
- Confluence docs confirmed: ✅
- Pre-Refined label: ✅

**Progress:** {{@index + 1}}/{{selected_tickets.length}} tickets pre-refined
</template-output>

</for-each>

</step>

---

<step n="8" goal="Pre-Refinement Complete">

<action>Communicate in {communication_language} with {user_name}</action>

<template-output section="summary">
# Pre-Refinement Session Complete! 🎯

{{#if epic_key}}

## Epic: {epic_key} - {epic_summary}

### Epic Review Phase ✅

{{#if epic_adjusted}}

- **Epic Adjusted**: Yes - requirements updated in Confluence and Jira
  {else}
- **Epic Validated**: Yes - matched Product Owner requirements
  {{/if}}
- **Confluence Pages Reviewed**: {{confluence_docs.length}}

### Ticket-Epic Alignment ✅

{{#if tickets_cancelled.length}}

- **Cancelled**: {{tickets_cancelled.length}} tickets
  {{/if}}
  {{#if tickets_updated.length}}
- **Updated**: {{tickets_updated.length}} tickets
  {{/if}}
  {{#if tickets_created.length}}
- **Created**: {{tickets_created.length}} tickets
  {{/if}}
  {{/if}}

## Pre-Refined {{selected_tickets.length}} Tickets

{{#each selected_tickets}}
{{@index}}. [{{this.key}}](https://nextgendevsolutions.atlassian.net/browse/{{this.key}}) - Pre-Refined ✅
{{#if this.priority_changed}}

- Priority: {{this.new_priority}} (adjusted from {{this.old_priority}})
  {{/if}}
- Confluence Docs: {{this.confluence_docs_count}} linked
  {{/each}}

{{#if priority_changes.length}}

## Priority Changes Made

{{#each priority_changes}}

- {{this.key}}: {{this.old}} → {{this.new}} ({{this.reason}})
  {{/each}}
  {{/if}}

## Next Steps

1. Run backlog refinement workflow on these {{selected_tickets.length}} tickets
2. Add technical details (coding standards, testing approach, design specs)
3. Mark tickets "Ready-for-Sprint"
4. Include in next sprint planning

---

**Session Duration**: {session_duration}
**Date**: {date}
**Tickets Pre-Refined**: {{selected_tickets.length}}
</template-output>

<note>Workflow complete. Delete state file.</note>

</step>

</workflow>
