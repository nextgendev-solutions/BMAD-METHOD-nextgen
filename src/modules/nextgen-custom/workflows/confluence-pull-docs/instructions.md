# Confluence Pull Documentation Workflow Instructions

**Purpose:** Fetch Confluence pages and save as markdown

---

<workflow name="confluence-pull-docs" version="1.0.0">

<step n="1" goal="Identify Pages to Fetch">

<communication>
Inform {user_name} in {communication_language}: Starting page identification. I'll help you select which Confluence pages to pull.
</communication>

## Step 1: Identify Pages to Fetch

<ask optional="true">
**Option 1:** Enter specific page IDs (comma-separated)
**Option 2:** Enter search query to find pages

Choose option (1/2):
</ask>

<check if="user_response == '1'">
  <ask>Enter page IDs (comma-separated):</ask>
  <action>Parse and store in {{page_ids}}</action>
</check>

<check if="user_response == '2'">
  <ask>Enter search query:</ask>
  <action>
**BMad-Master delegates to confluence-manager**: Search Confluence

**Agent**: confluence-manager (BMad built-in)
**Operation**: searchConfluenceUsingCql
**Parameters**:

- cloudId: "{jira_cloud_id}"
- cql: "space='{confluence_space}' AND text ~ '{{search_query}}'"
- limit: 10

**Expected Return**: Search results with page IDs

Extract page IDs from results → Store in {{page_ids}}
</action>
</check>

---

</step>

<step n="2" goal="Fetch and Save Pages">

<communication>
Inform {user_name} in {communication_language}: Fetching and saving the selected Confluence pages as markdown files.
</communication>

## Step 2: Fetch and Save Pages

<for-each page_id in page_ids>

<action>
**BMad-Master delegates to confluence-manager**: Fetch page

**Agent**: confluence-manager (BMad built-in)
**Operation**: getConfluencePage
**Parameters**:

- cloudId: "{jira_cloud_id}"
- pageId: "{{page_id}}"

**Expected Return**: Page title and content in Markdown format

Store: {{page_title}}, {{page_content}}
</action>

<action>
Save to file:

File: {{output_directory}}/{{page_title_slug}}.md

Content: {{page_content}}
</action>

<checkpoint id="page_fetched">Mark {{page_id}} saved</checkpoint>

</for-each>

---

</step>

<step n="3" goal="Pull Complete">

<communication>
Inform {user_name} in {communication_language}: All pages have been fetched and saved. Generating final summary.
</communication>

## Step 3: Pull Complete

<template-output section="complete">
## ✅ Confluence Docs Pulled

**Pages fetched:** {{page_ids.length}}

{{#each page_ids}}

- {{this.title}} → {{output_directory}}/{{this.slug}}.md
  {{/each}}

Documentation synced successfully!
</template-output>

</step>

</workflow>
