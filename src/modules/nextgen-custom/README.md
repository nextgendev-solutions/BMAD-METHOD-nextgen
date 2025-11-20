# NextGen Custom Module

Project-specific workflows for eSIM NextGen development with Jira, Confluence, and Git integration.

## Overview

This module provides automated workflows for managing development sprints, integrating with Atlassian tools (Jira, Confluence) and Git for streamlined project management.

## Module Structure

### Workflows

**[start-sprint](./workflows/start-sprint/)** - Start Jira sprint and create sprint branch

Automated workflow for:

- Fetching next future sprint from Jira
- Starting the sprint (changing status to "active")
- Validating all tickets have required checklists (Developer Implementation, Code Review, QA Validation)
- Creating isolated sprint branch in Git
- Reporting sprint readiness

**Key Features:**

- Jira sprint state management
- Checklist validation enforcement
- Sprint branch creation with goal-based naming
- State management and recovery
- Error handling with user prompts

## Configuration

This module requires the following configuration during installation:

### Jira Configuration

- `jira_cloud_id` - Your Jira Cloud ID (e.g., bfeeb19d-00e7-42ae-8fe6-d1decb3d2c30)
- `jira_project_key` - Project key (e.g., ESNG)
- `jira_board_id` - Board ID (e.g., 100)

### Git Configuration

- `git_main_branch` - Main branch name (default: main)
- `git_sprint_branch_prefix` - Sprint branch prefix (default: sprint/)

### Confluence Configuration (Optional)

- `confluence_space_key` - Confluence space key (e.g., EN)

### Sprint Artifacts

- `sprint_artifacts` - Location for sprint-related files (default: .bmad/sprint)

## Installation

Install this module using the BMAD installer:

```bash
npx @your-org/bmad-method@alpha install
```

Or from local fork:

```bash
node ~/Dropbox/Workspaces/NextGenDev/BMAD-METHOD-nextgen/tools/cli/bmad-cli.js install
```

During installation:

1. Select "NextGen Custom Workflows" from the module list
2. Answer configuration prompts for Jira, Git, and Confluence
3. Module will be installed to `bmad/nextgen-custom/` in your project

## Usage

After installation, workflows are available via slash commands:

```bash
# Start a new sprint
/bmad:nextgen-custom:workflows:start-sprint
```

### Start Sprint Workflow

Initiates a new development sprint by:

1. **Fetching Future Sprint**: Retrieves the next future sprint from Jira board
2. **Validating Prerequisites**: Ensures all sprint tickets have required checklists
3. **Starting Sprint**: Changes sprint status to "active" in Jira
4. **Creating Sprint Branch**: Creates isolated branch in Git with sprint goal
5. **Reporting Status**: Confirms sprint is ready for development

**Prerequisites:**

- Future sprint exists in Jira with planned tickets
- All tickets have Developer Implementation, Code Review, and QA Validation checklists
- Git repository is clean and up-to-date

**Outputs:**

- Sprint activated in Jira
- Sprint branch created: `sprint/{number}-{goal-slug}`
- Sprint state file: `.bmad/sprint/sprint-{number}-state.json`

## Dependencies

This module depends on:

- **BMM (BMAD Method Module)**: Inherits core configuration
- **jira-manager agent**: For Jira operations
- **git-manager agent**: For Git operations

## Module Version

Current version: 1.0.0

## Support

For issues or questions:

- Check workflow instructions in `workflows/start-sprint/instructions.md`
- Review BMAD documentation
- Contact module maintainer
