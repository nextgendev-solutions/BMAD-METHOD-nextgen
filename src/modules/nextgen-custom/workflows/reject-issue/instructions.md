<?xml version="1.0" encoding="UTF-8"?>
<workflow name="reject-issue" version="1.0.0">

<metadata>
  <purpose>Reject story and move to backlog with feedback</purpose>
</metadata>

<step n="1" goal="Get Rejection Details">
<communication action="ask">Request issue key and rejection reason from user</communication>

<ask>Issue key to reject (e.g., ESNG-45):</ask>
<action>Store {issue_key}</action>

<ask>Rejection reason (detailed feedback):</ask>
<action>Store {rejection_reason}</action>
</step>

<step n="2" goal="Transition to Backlog">
<communication action="inform">Moving issue back to backlog</communication>

<action>
**BMad-Master delegates to jira-manager**: Transition to Backlog

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: transitionJiraIssue
**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{issue_key}"
- transition: { id: "{backlog_transition_id}" }
  </action>
  </step>

<step n="3" goal="Add Rejection Comment">
<communication action="inform">Adding rejection feedback comment</communication>

<action>
**BMad-Master delegates to jira-manager**: Add rejection feedback

**Agent**: jira-manager (`~/.claude/agents/jira-manager.md`)
**Operation**: addCommentToJiraIssue
**Parameters**:

- cloudId: "{jira_cloud_id}"
- issueIdOrKey: "{issue_key}"
- commentBody: Rejection message with reason and action required
  </action>
  </step>

<step n="4" goal="Rejection Complete">
<communication action="confirm">Confirm rejection processed successfully</communication>

<template-output section="rejected">
## ❌ Issue Rejected: [{issue_key}](https://nextgendevsolutions.atlassian.net/browse/{issue_key})

**Reason:** {rejection_reason}

Issue moved to Backlog with feedback comment.
</template-output>
</step>

</workflow>
