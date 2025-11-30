# Close Sprint Workflow Instructions

**Purpose:** Complete sprint and create PR to main

---

<workflow name="close-sprint" version="1.0.0">

<step n="1" goal="Verify Sprint Completion">
<communication>
Inform {user_name} in {communication_language}: Verifying sprint completion status and identifying incomplete stories
</communication>

<action>
**BMad-Master delegates to jira-manager**: Verify sprint completion

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: searchJiraIssuesUsingJql
**Parameters**:

- cloudId: "{jira_cloud_id}"
- jql: "project={jira_project_key} AND sprint IN openSprints() ORDER BY status ASC"
- maxResults: 100

**Expected Return**: All tickets in active sprint
</action>

<action>
Filter tickets NOT in "Done" status → Store in {{incomplete_stories}}
</action>

<check if="incomplete_stories.length > 0">
  <template-output section="incomplete">
## ⚠️ Sprint Incomplete

Found {{incomplete_stories.length}} stories not in Done status:

{{#each incomplete_stories}}

- [{{this.key}}: {{this.summary}}]({{this.url}}) - Status: {{this.status}}
  {{/each}}

**Options:**

1. Move incomplete stories to Backlog (recommended)
2. Cancel sprint closure

What should I do? (1/2)
</template-output>

<ask>Enter option (1 or 2):</ask>

  <check if="user_response == '2'">
    <action>STOP: Sprint closure cancelled. Workflow paused.</action>
  </check>

  <check if="user_response == '1'">
    <for-each story in incomplete_stories>
      <action>
**BMad-Master delegates to jira-manager**: Move story to Backlog

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: transitionJiraIssue
**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{{story}}"
- transition: { id: "{{backlog_transition_id}}" }
  </action>
  </for-each>
  </check>
  </check>

<checkpoint id="phase_complete">Save state: incomplete_stories handled</checkpoint>

</step>

<step n="2" goal="Create PR to Main">
<communication>
Inform {user_name} in {communication_language}: Creating pull request from sprint branch to main
</communication>

<action>Identify sprint branch (e.g., sprint/3-user-onboarding)</action>

<invoke-task agent="git-manager">
Create pull request from {sprint_branch} to main.

STEPS:

1. Ensure all feature branches merged to {sprint_branch}
2. Push {sprint_branch} to remote
3. Create PR using gh cli:
   gh pr create --base main --head {sprint_branch} \
    --title "Sprint {sprint_number} Completion" \
    --body "Complete Sprint {sprint_number} - ready for main merge"

REPORT: PR URL
</invoke-task>

<action>Store {{pr_url}} from git-manager response</action>

<checkpoint id="phase_complete">Save state: pr_url</checkpoint>

</step>

<step n="3" goal="Sprint Closure Summary">
<communication>
Inform {user_name} in {communication_language}: Generating sprint closure summary with PR details and next steps
</communication>

<template-output section="summary">
# Sprint {sprint_number} Closure 🎯

## Pull Request Created

- **PR URL:** {{pr_url}}
- **Branch:** {sprint_branch} → main

## Next Steps

1. Review PR: {{pr_url}}
2. Approve and merge PR
3. Run retrospective: `/retrospective Sprint {sprint_number}`

Sprint ready for final merge approval!
</template-output>

<checkpoint id="phase_complete">Save state: summary displayed</checkpoint>

</step>

<step n="4" goal="Close Sprint in Jira">
<communication>
Inform {user_name} in {communication_language}: Closing sprint in Jira
</communication>

<action>
**BMad-Master delegates to jira-manager**: Close sprint in Jira

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: jira_update_sprint
**Parameters**:

- sprint_id: "{{sprint_id}}"
- state: "closed"

**Expected Return**: Sprint closure confirmation
</action>

<template-output section="jira-closed">
## Jira Sprint Closed

Sprint {{sprint_name}} (ID: {{sprint_id}}) has been closed in Jira.

Velocity and sprint metrics are now available in Jira reports.
</template-output>

<checkpoint id="phase_complete">Workflow complete. Delete state file.</checkpoint>

</step>

</workflow>
