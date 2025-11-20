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

**[pre-refinement](./workflows/pre-refinement/)** - Interactive epic-based pre-refinement with Product Owner participation

Automated workflow for:

- Epic-based or manual ticket selection for refinement
- Interactive epic review with Product Owner (3-round discussion)
- Smart Confluence documentation fetching
- Ticket-epic alignment validation
- Multi-round interactive refinement sessions
- Design asset validation (UI/UX stories)
- Automatic labeling with "Pre-Refined"

**Key Features:**

- Highly interactive - Product Owner actively participates
- Epic validation before child ticket refinement
- Smart Confluence fetching (auto-detect or prompt)
- 3-round conversation: Initial → Clarify → Finalize
- Priority adjustments during session
- Design consistency validation (Sally UX Expert)
- State checkpointing per ticket

**[backlog-refinement](./workflows/backlog-refinement/)** - Refine top backlog items with complete details

Automated workflow for:

- Retrieve top backlog items from Jira (JQL: Ready-for-Refinement)
- Multi-agent party-mode refinement (7 agents)
- Complete acceptance criteria and technical notes
- Create native Jira checklists (Developer Implementation, Code Review, QA Validation)
- Design asset validation by Sally (UX Expert)
- Apply "Ready-for-Sprint" label after completion
- State checkpointing per ticket with recovery

**Key Features:**

- Product Owner is OBSERVER (agents discuss, not interactive)
- 7-agent party-mode coordination
- Sally UX design standards review
- ADF Action Items creation via jira-manager
- Automatic recovery with Jira verification
- Design consistency validation across stories

**[sprint-planning](./workflows/sprint-planning/)** - Complete sprint planning with Gherkin criteria

Automated workflow for:

- Sprint initialization with ticket selection
- Generate Gherkin acceptance criteria (5 scenarios per ticket)
- Create 3 native Jira checklists (Developer Implementation, Code Review, QA Validation)
- Set story points (customfield_10016)
- Mark dependencies (issue links)
- Assign tickets to user
- Attach design assets for UI stories
- Create sprint in Jira with all tickets
- Generate sprint kickoff summary

**Key Features:**

- Native Jira Action Items (interactive checkboxes in Jira UI)
- Gherkin acceptance criteria generation
- State checkpointing after each ticket
- Design asset attachment for UI stories
- Delegates to jira-manager for all Jira operations
- Automatic recovery with Jira verification

**[continue-current-sprint](./workflows/continue-current-sprint/)** - Resume active sprint by picking next story and executing implementation

Automated workflow for:

- Identify next story from active sprint backlog
- Prepare execution context (bug analysis for bug tickets)
- Delegate to story-implementation workflow for development cycle
- Runtime verification and evidence upload to Jira
- Loop through all remaining stories until sprint complete

**Key Features:**

- Bug analyzer integration (runtime reproduction for bug tickets)
- Runtime command injection (IDEA run configurations)
- Party-mode pairing for complex stories
- Self-sufficient agent architecture with state folders
- Runtime verification and evidence upload to Jira
- Autonomous story-by-story execution with checkpointing

**[story-implementation](./workflows/story-implementation/)** - Complete dev → code review → QA → merge cycle for single story

Automated workflow for:

- Start story with dependency validation and branch creation
- Development implementation with TDD and checklist enforcement
- Code review validation against coding standards
- QA validation with test execution and coverage verification
- Merge to sprint branch with quality gates
- State machine transitions (start → dev → review → qa → merge → complete)

**Key Features:**

- State machine with recovery (6 phases with rejection loops)
- Dependency validation with blocker detection
- Lazy loading cache (ticket.md, confluence/\*.md)
- Self-sufficient agents (autonomous Jira/Confluence fetch)
- Git branch management via git-manager
- Checklist enforcement BEFORE all Jira transitions
- Automatic phase checkpointing with Jira/Git verification
- Pair programming mode for complex stories

**[close-sprint](./workflows/close-sprint/)** - Complete sprint, create PR to main, prepare for next sprint

Automated workflow for:

- Verify sprint completion status in Jira
- Identify complete and incomplete stories
- Handle incomplete stories (move to backlog or next sprint)
- Create pull request from sprint branch to main
- Generate sprint closure summary with PR details
- Prepare for retrospective workflow

**Key Features:**

- State checkpointing after each phase
- Incomplete story handling with user decision
- PR creation for user review (NO auto-merge to main)
- Sprint completion verification
- Follows NEVER MERGE TO MAIN rule

**[retrospective](./workflows/retrospective/)** - Generate sprint retrospective with metrics, feedback, and action items

Automated workflow for:

- Gather sprint metrics from Jira (stories, points, completion rate)
- Collect team feedback via party-mode agent retrospectives
- Generate retrospective document with findings
- Create action items in Jira for improvements
- Publish retrospective to Confluence for team reference

**Key Features:**

- State checkpointing
- Party-mode agent retrospectives (ALL agents participate)
- Confluence documentation
- Action item creation in Jira
- Template-based document generation

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
