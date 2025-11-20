<workflow>

<critical>Communicate in {communication_language} throughout the workflow</critical>

# Backlog Refinement Workflow Instructions

**Purpose:** Refine top backlog items with complete details and mark them "Ready for Sprint"

---

## Recovery Protocol

<check if="state_file_exists">
  <action>Load state → Verify refined tickets in Jira → Prompt user to resume</action>
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
- jql: "project=ESNG AND status=\"To Do\" AND type != Epic AND labels NOT IN (\"Ready-for-Sprint\") ORDER BY priority DESC, created ASC"
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

<note>Save state: selected_tickets</note>

</step>

---

<step n="2" goal="Refine Each Ticket">

<action>Communicate in {communication_language} with {user_name}</action>

<for-each ticket in selected_tickets>

<action>Set {current_ticket_index} = {{@index}}</action>

### 2.1: Fetch Ticket and Confluence Docs

<action>
**BMad-Master delegates to jira-manager**: Fetch complete ticket details

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: getJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"

**Expected Return**: Complete ticket object with description, status, labels, priority, assignee

Store results in: {ticket_summary}, {ticket_description}, {ticket_status}, etc.
</action>

<action>
Parse {ticket_description} for Confluence links (URLs containing `/wiki/spaces/` or `/wiki/pages/`)

If Confluence links found → Extract page IDs
</action>

<check if="confluence_links.length > 0">
  <action>
  **BMad-Master delegates to confluence-manager**: Fetch related Confluence pages

**Agent**: confluence-manager (BMad built-in)

**Operation**: getConfluencePage (for each link)

**Parameters**:

- cloudId: "{jira_cloud_id}"
- pageId: "{extracted_page_id}"

**Expected Return**: Page content in Markdown format

Store results in: {confluence_context}
</action>
</check>

### 2.1a: Parse @Mentions from Jira (NEW)

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

### 2.1b: UX Design Validation (Path Depends on Pre-Refined Label)

**Duration**: 5-25 minutes (depends on ticket preparation state)

<action>
**Check ticket labels** to determine refinement path:

<check if="ticket.labels.includes('Pre-Refined')">
  **PATH A: PRE-REFINED TICKET - Light Validation & Gap Analysis** (5-10 min)

Set {{refinement_path[current_ticket]}} = "pre-refined-light"

**BMad-Master delegates to ux-exprt (Sally)**: Light UX validation and gap analysis

**Agent**: bmad:bmm:agents:ux-exprt

**Sally's Light Review Workflow**:

#### For Stories with "Screen", "Interface", "View", "Modal", "Dialog", "Form", "Button", "Menu" in Title:

**LIGHT VALIDATION & GAP ANALYSIS** (5-10 min):

**Step 1: Verify Designs Still Current**

1. Check screenshot attached to Jira (from pre-refinement)
2. Verify wireframe file still exists at referenced path
3. Verify design specs in Jira description are complete

**Step 2: Quick Regression Check**

1. Scan wireframe for obvious Material3 violations (quick visual scan, not deep analysis)
2. Spot-check 2-3 components for accessibility (quick check, not full audit)
3. Verify design-system.md reference is still current

**Step 3: Gap Analysis** (CRITICAL - Check for changes since pre-refinement)

1. **Compare current ACs vs original ACs from pre-refinement**:
   - Read current Jira description → Extract ACs
   - Compare with Pre-Refinement Session Notes section
   - Identify: Were NEW ACs added? Were ACs modified?

2. **If NEW/Modified ACs found**:
   - Check wireframes for coverage of new ACs
   - Example: AC added "Show loading spinner during save" → Does wireframe show spinner?
   - If gap found → Note in {ux_issues_found}

3. **Cross-Story Consistency Spot-Check**:
   - Quick check: Do sibling stories still use same patterns?
   - Example: Button heights consistent across ESNG-41, ESNG-42?
   - Only check if obviously visible, not deep comparison

**Step 4: Present Gaps (IF FOUND)**

  <check if="ux_issues_found.length > 0">
    <action>
    Sally presents gap analysis findings:

    **Gap Analysis Results**:
    ```
    ## Gaps Found in {current_ticket} (Pre-Refined Ticket)

    ### New ACs Added Since Pre-Refinement:
    1. **AC 5: Show loading spinner during save**
       - Wireframe Coverage: ❌ Missing
       - Impact: Dev won't know what to implement
       - Fix: Add loading state to wireframe section

    2. **AC 6: Display error message if network fails**
       - Wireframe Coverage: ⚠️ Partial (shows error, but not network-specific)
       - Impact: Error message text unclear
       - Fix: Update wireframe with specific error message

    ### Design Regressions Detected:
    3. **Button height changed** (vs pre-refinement screenshot)
       - Pre-refinement: 48dp
       - Current wireframe: 40dp (someone edited wireframe file)
       - Impact: Accessibility violation
       - Fix: Revert to 48dp

    **Total Gaps**: {{ux_issues_found.length}}
    **Estimated Fix Time**: 10 minutes
    ```

    Store in {ux_issues_found}
    </action>

    <ask>

Sally found {{ux_issues_found.length}} gaps in pre-refined ticket {current_ticket}.

**Options**:
A) Sally fixes gaps now ({estimated_fix_time} min) - Continue refinement after fixes
B) Mark "Design-Gap" and BLOCK "Ready-for-Sprint" (HARD GATE)

Enter A or B:
</ask>

    <action>Store in {po_fix_decision}</action>

    <check if="po_fix_decision == 'A'">
      <action>
      Sally fixes gaps (same process as full validation fixes):
      - Update wireframes for new ACs
      - Fix regressions
      - Commit to Git via git-manager
      - Update Jira screenshot

      Set {{design_sign_off[current_ticket].approved}} = true
      Store in {ux_fixes_applied}
      </action>

      <template-output>

✅ **Sally fixed {{ux_issues_found.length}} gaps** (Pre-Refined Ticket)

- Gaps closed: {{ux_issues_found.length}}
- Design sign-off: ✅ APPROVED

Proceeding with refinement...
</template-output>
</check>

    <check if="po_fix_decision == 'B'">
      <action>
      **BMad-Master delegates to jira-manager**: Block ticket

      Operations:
      1. Add label "Design-Gap"
      2. Add comment documenting gaps
      3. **DO NOT add "Ready-for-Sprint" label** (BLOCKED)

      Store in {design_blocked_tickets}
      Set {{design_sign_off[current_ticket].approved}} = false
      </action>

      <template-output>

⛔ **{current_ticket} BLOCKED - Design gaps unresolved** (Pre-Refined Ticket)

**Label Added**: "Design-Gap"
**Gaps**: {{ux_issues_found.length}} documented in Jira

Skipping to next ticket...
</template-output>

      <action>Skip to next ticket</action>
    </check>

  </check>

  <check if="ux_issues_found.length == 0">
    <action>
    No gaps found - designs still valid since pre-refinement

    Set {{design_sign_off[current_ticket].approved}} = true
    Set {{design_assets_prepared[current_ticket]}} = true
    </action>

    <template-output>

✅ **Sally's Light Review: APPROVED** (Pre-Refined Ticket)

- Pre-refinement designs: ✅ Still current
- No new ACs since pre-refinement: ✅
- No regressions detected: ✅

Proceeding with refinement...
</template-output>
</check>

#### For BE/Shared/Platform Stories (No Screen in Title):

**LIGHT REVIEW** (5 min):
Same as full validation (no difference for BE stories)

  <action>
  Set {{design_sign_off[current_ticket].approved}} = true
  Set {{sally_review_complete[current_ticket]}} = "light_review"
  </action>
</check>

<check if="!ticket.labels.includes('Pre-Refined')">
  **PATH B: NON-PRE-REFINED TICKET - Full Validation** (20-25 min)

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

<note>Save state: sally_review_complete, design_assets_prepared, ux_issues_found, ux_fixes_applied, design_consistency_validated, design_sign_off, design_blocked_tickets</note>

### 2.1c: Examine Existing Codebase (Pre-Party-Mode)

<action>
**BMad-Master delegates to developer agent**: Quick codebase scan for reusable components

**Agent Selection**:

- If {ticket_labels} contains "BE" → delegate to spring-webflux-kotlin-dev
- If {ticket_labels} contains "Shared" or "Platform" or "UI" → delegate to kmp-flow-dev
- Default → kmp-flow-dev

**Agent**: spring-webflux-kotlin-dev OR kmp-flow-dev (based on label)

**Task**: Search for existing implementations before party-mode

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

<note>Save state: existing_implementations, reusable_components, patterns_found</note>

### 2.2: Party-Mode Discussion (Path Depends on Pre-Refined Label)

**Duration**: 15-45 minutes (depends on ticket preparation state)

<check if="refinement_path[current_ticket] == 'pre-refined-light'">
**PATH A: LIGHT PARTY-MODE - Pre-Refined Ticket** (15-20 min)

**Focus**: Verification + Gap Analysis + Story Points

<action>
Execute light party-mode verification session for {current_ticket}:

**Context for Party-Mode**:

- Ticket: {current_ticket}
- Summary: {ticket_summary}
- Pre-Refinement Status: ✅ Pre-Refined (light validation mode)
- Gap Analysis Results: {gap_analysis_results}
- **🔔 Agent Mentions**: {{mentions_found[current_ticket]}}

**Mention Handling**:
{{#each mentions_found[current_ticket]}}

- **{{this.agent_id}}**: You were mentioned in {{this.source}}:

  > "{{this.context}}"

  Please address this mention during the discussion.
  {{/each}}

**Session Type**: Backlog Refinement (Light Verification)

**Required Participants**: Core agents only

- Product Manager - Validate ACs completeness
- Backend Dev OR KMP Dev (based on label) - Validate technical feasibility
- UX Expert (Sally - bmad:bmm:agents:ux-exprt) - Present gap analysis findings
- QA - Validate testing approach
- Scrum Master (facilitates session)

**Discussion Topics** (Streamlined):
{{#if mentions_found[current_ticket].length > 0}} 0. **🔔 Address Mentions FIRST** (Mentioned agents respond)
{{/if}}

1. **Verification Check** (PM + QA): Has anything changed since pre-refinement?
2. **Gap Analysis Review** (Sally leads):
   - Present any gaps/regressions found in Step 2.1b
   - Discuss if changes require wireframe updates
   - Confirm design sign-off still valid
3. **AC Completeness** (PM + QA + Sally): Are current ACs complete? Any new edge cases?
4. **Dependencies Check**: Any new blockers since pre-refinement?
5. **Story Point Re-Validation**: Do points need adjustment? (All vote)

**Required Output**:

- Gap analysis addressed (Sally approved)
- ACs validated as complete (PM + QA approved)
- Story points confirmed or adjusted
- Dependencies verified

Execute: \*party-mode
</action>
</check>

<check if="refinement_path[current_ticket] == 'full'">
**PATH B: FULL PARTY-MODE - Non-Pre-Refined Ticket** (30-45 min)

**Focus**: Complete refinement from scratch

<action>
Execute full party-mode refinement session for {current_ticket}:

**Context for Party-Mode**:

- Ticket: {current_ticket}
- Summary: {ticket_summary}
- Description: {ticket_description}
- Confluence Context: {confluence_context}
- **🔔 Agent Mentions**: {{mentions_found[current_ticket]}}

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
</check>

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

### 2.3: Update Ticket Description with Action Items

<action>
**STEP 1: Update non-AC sections (markdown format)**

**BMad-Master delegates to jira-manager**: Update ticket with technical details

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: editJiraIssue

**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- fields:
  - description: Formatted markdown with:
    - {original_description}
    - Separator: "---"
    - Section: "## Technical Notes" + {technical_notes}
    - Section: "## Testing Approach" + {testing_approach}
    - Section: "## Dependencies" + {dependencies}

**Expected Return**: Success confirmation

**Note**: Technical sections remain in markdown format
</action>

<action>
**STEP 2: Add Acceptance Criteria as Native Action Items**

**BMad-Master delegates to jira-manager**: Create Acceptance Criteria Action Items (ADF format)

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)

**Operation**: Create Action Items using REST API v3 with ADF format (see jira-manager.md Section 2)

**Delegation Instruction**:
"Create Acceptance Criteria as Native Jira Action Items for {current_ticket}:

Heading: 'Acceptance Criteria'
Items: Use localId naming ac-1, ac-2, ..., ac-N
Format: Each AC as separate taskItem with state='TODO'

Append to existing description (do not replace). Use ADF taskList/taskItem structure.

**IMPORTANT - Code Examples in Technical Notes**: If technical notes contain code examples, use native ADF code blocks with syntax highlighting:

- Use code_block(code, language) helper function (defined in jira-manager.md)
- Set language attribute: 'kotlin', 'java', 'bash', 'json', 'yaml', etc.
- DO NOT use Wiki markup {noformat} or {{...}} - these lack syntax highlighting
- Example: code_block('fun example() { ... }', 'kotlin')"

**Pass to jira-manager**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{current_ticket}"
- ac_items: {acceptance_criteria} (array of text items from party-mode discussion)

**Expected Return**: Success confirmation with number of AC items created

**Implementation Note**: jira-manager will:

1. Fetch current description ADF via REST API
2. Parse existing content array
3. Add heading: {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Acceptance Criteria"}]}
4. Add taskList with proper localId naming (ac-1, ac-2, ..., ac-N)
5. PUT updated ADF back to ticket
6. Verify Action Items appear in Jira UI

**Fallback**: If ticket already has AC in mixed format, jira-manager appends new Action Items without duplicating
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

Proceed with marking "Ready-for-Sprint":

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

**Note**: jira-manager will fetch current labels, merge with new label, and update
</action>
</check>

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

<note>
Mark {current_ticket} refined.
Save state: refined_tickets[current_ticket] = {
  refined: true,
  ready_for_sprint: true,
  mentions_addressed: {{mentions_found[current_ticket].length}}
}

Save state: mentions_found, mention_responses
</note>

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
  {{#if refinement_path[this] == 'pre-refined-light'}}
  - Refinement Path: 🔄 Pre-Refined (Light validation + Gap analysis)
    {{else if refinement_path[this] == 'full'}}
  - Refinement Path: 📋 Full Refinement (Deep validation)
    {{/if}}
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

<note>Workflow complete. Delete state file.</note>

</step>

</workflow>
