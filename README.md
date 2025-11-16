# TeaserPaste CLI (`tp`)

**TeaserPaste CLI** (`tp`) is a powerful command-line tool that helps you interact with the [TeaserPaste](https://paste.teaserverse.online) service directly from your terminal. Easily view, create, and manage snippets without leaving your workflow.

**Current Version:** 0.6.7 (Beta) - Please note that features and syntax are subject to change.

## Installation

- Requires [Node.js](https://nodejs.org/en/download) v18 or higher.
```bash
npm install -g teaserpaste-cli
```

**For Windows users, you can choose install via [EXE](https://github.com/TeaserPaste/cli/releases) file *(Experiment)*.**

## First-Time Config

To avoid typing your API key every time, save your private key once:
```bash
tp config set token "priv_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## Quick Start Guide

### Creating and Copying Snippets
```bash
# The friendliest way (the CLI will prompt you)
tp create -i

# Copy (fork) a snippet to your account
tp copy <snippet_id> --title "My copy"

# The professional way (create snippet from file content)
cat my_script.js | tp create --title "My Script" --language "javascript"

# The fastest way (provide all arguments)
tp create --title "My Note" --content "Note content"
```

### Executing Code from Snippets

Execute code directly from a snippet. The CLI will show a warning and require confirmation before running.
```bash
# Auto-detect language and run (supports python, node, bash...)
tp run <snippet_id>

# Provide a custom execution command (replaces --snippet with the temp filename)
tp run <snippet_id> -- "node --snippet --arg1"
```

### Interacting (Starring) Snippets
```bash
# Star a snippet you like
tp star <snippet_id>

# Unstar it
tp star <snippet_id> --unstar
```

### Viewing and Managing Snippets
```bash
# See a quick overview of your snippet stats
tp stats

# List your snippets
tp list

# Include deleted snippets (in trash)
tp list --includeDeleted

# View details of a snippet
tp view <snippet_id>

# Get only the raw content (for scripting)
tp view <snippet_id> --raw

# Copy content to clipboard
tp view <snippet_id> --copy

# Open the snippet in your browser
tp view <snippet_id> --url

# Search public snippets with pagination
tp search "javascript example" --limit 5 --from 10

# Delete a snippet (moves to trash)
tp delete <snippet_id>

# Restore a snippet from the trash
tp restore <snippet_id>
```

## Help
```bash
# To see all available commands and options:
tp --help

# To see the current CLI version:
tp --version
```

> Detailed Docs (Vietnamese-only): https://docs.teaserverse.online/triple-tool/teaserpaste/cli

License:
[MIT](LICENSE.txt)
