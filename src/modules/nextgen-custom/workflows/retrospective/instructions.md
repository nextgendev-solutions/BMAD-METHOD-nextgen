# Sprint Retrospective Workflow Instructions

**Purpose:** Generate sprint retrospective document with metrics and feedback

---

<workflow name="retrospective" version="1.0.0">

<step n="1" goal="Gather Sprint Metrics">
<communication>
Inform {user_name} in {communication_language}: Gathering sprint metrics from Jira
</communication>

<action>
**BMad-Master delegates to jira-manager**: Fetch sprint stories

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: searchJiraIssuesUsingJql
**Parameters**:

- cloudId: "{jira_cloud_id}"
- jql: "project={jira_project_key} AND sprint={sprint_number} ORDER BY status DESC"
- maxResults: 100

**Expected Return**: Array of sprint stories

Calculate:

- {{completed_count}} = stories with status="Done"
- {{total_story_points}} = sum of story points
- {{velocity}} = completed story points
  </action>

<checkpoint id="phase_complete">Save state: sprint_stories, metrics</checkpoint>

</step>

<step n="2" goal="Collect Feedback">
<communication>
Inform {user_name} in {communication_language}: Collecting sprint feedback
</communication>

<ask>What went well this sprint? (Enter feedback):</ask>
<action>Store in {{feedback_collected.went_well}}</action>

<ask>What could be improved? (Enter feedback):</ask>
<action>Store in {{feedback_collected.improvements}}</action>

<ask>Action items for next sprint? (Enter items):</ask>
<action>Store in {{feedback_collected.action_items}}</action>

<checkpoint id="phase_complete">Save state: feedback_collected</checkpoint>

</step>

<step n="3" goal="Generate Retrospective Document">
<communication>
Inform {user_name} in {communication_language}: Generating retrospective document
</communication>

<template-output section="retrospective">
# Sprint {sprint_number} Retrospective

**Date:** {{date}}
**Participants:** {{user_display_name}}

## Metrics

- **Total Stories:** {{sprint_stories.length}}
- **Completed:** {{completed_count}} ({{completion_percentage}}%)
- **Total Story Points:** {{total_story_points}}
- **Velocity:** {{velocity}} SP

## What Went Well ✅

{{feedback_collected.went_well}}

## What Could Be Improved 🔄

{{feedback_collected.improvements}}

## Action Items for Next Sprint 🎯

{{feedback_collected.action_items}}

## Story Breakdown

{{#each sprint_stories}}

- [{{this.key}}]({{this.url}}): {{this.summary}} - {{this.status}} ({{this.storyPoints}} SP)
  {{/each}}

---

Generated: {{timestamp}}
</template-output>

<checkpoint id="phase_complete">Workflow complete. Delete state file.</checkpoint>

</step>

</workflow>
