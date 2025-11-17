#!/usr/bin/env node
const logger = require('./logger');
const pkg = require('./package.json');
const ConfigManager = require('./config-manager');
const {
    viewSnippet,
    cloneSnippet,
    viewUser,
    createSnippet,
    manageConfig,
    listSnippets,
    updateSnippet,
    deleteSnippet,
    searchSnippets,
    copySnippet,
    runSnippet,
    showStats,
    starSnippet,
    restoreSnippet
} = require('./commands');

/**
 * Parses command-line arguments.
 * @param {string[]} argv - Array of command-line arguments.
 * @returns {object} - Parsed arguments object.
 */
function parseArgs(argv) {
    const args = { _: [], env: {} };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.substring(2);
            if (key === 'env') {
                if (i + 1 < argv.length) {
                    const [envKey, ...envValParts] = argv[i + 1].split('=');
                    args.env[envKey] = envValParts.join('=');
                    i++;
                }
            } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                args[key] = argv[i + 1];
                i++;
            } else {
                args[key] = true;
            }
        } else if (arg.startsWith('-')) {
            const keys = arg.substring(1).split('');
            keys.forEach(key => {
                args[key] = true;
            });
        } else {
            args['_'].push(arg);
        }
    }
    return args;
}

/**
 * Displays the help message.
 */
function showHelp() {
    console.log(`
--- TeaserPaste CLI (v${pkg.version}) ---

Usage: 
  tp <command> [arguments] [options]

Commands:
  view <id>                 View a snippet.
  clone <id> [filename]     Download snippet content to a file.
  copy <id>                 Copy (fork) a snippet to your account (creates a private copy).
  star <id>                 Star a snippet.
  restore <id>              Restore a deleted snippet (from trash).
  run <id> [command]        Execute a snippet (e.g., "node --snippet").
  stats                     View statistics about your snippets.
  list                      List your snippets.
  create                    Create a new snippet.
  update <id>               Update an existing snippet.
  delete <id>               Delete a snippet (moves to trash).
  search <term>             Search public snippets.
  user view                 View your user information.
  config <set|get|clear>    Manage CLI configuration.

Options for 'run':
  --install-deps            Automatically install dependencies (npm/pip).
  --env <KEY>=<VALUE>       Pass environment variables to the process.
  --input-file <path>       Pipe file content to script's stdin.
  --output-file <path>      Write script's stdout to a file.
  --copy-result             Copy stdout result to clipboard.
  --on-error-paste          Automatically create a private snippet on error.
  --timeout <duration>      Set a timeout (e.g., 10s, 1m).
  -f, --force               Skip security warning when executing.
  -s, --silent              Run in silent mode (no logs).

Options for 'view':
  --raw                     Only print the raw content of the snippet.
  --copy                    Copy snippet content to clipboard.
  --url                     Show the URL of the snippet.

Options for 'star':
  --unstar                  (for 'star') Unstar instead of starring.
  
Options for 'list':
  -d, --includeDeleted      Include deleted snippets (in trash).

General Options:
  --token <key>
  --password <pass>
  -s                        (for 'user view') List user's public snippets.
  --debug                   Display detailed logs for debugging.
  -v, --version             Show version.
  -h, --help                Show help.
    `);
}

/**
 * Main application entry point.
 */
async function main() {
    process.on('SIGINT', () => {
        console.log('\nOperation canceled. See you later!');
        process.exit(0);
    });

    try {
        let rawArgs = process.argv.slice(2);
        const debugIndex = rawArgs.indexOf('--debug');
        if (debugIndex > -1) { logger.init(true); rawArgs.splice(debugIndex, 1); logger.log('Debug mode enabled.'); }

        if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
            showHelp();
            return;
        }
        if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
            console.log(pkg.version);
            return;
        }

        const args = parseArgs(rawArgs);
        const [command, ...subArgs] = args['_'];
        const token = args.token || await ConfigManager.getToken();

        switch (command) {
            case 'view':
                await viewSnippet(subArgs[0], token, args.password, {
                    raw: args.raw,
                    copy: args.copy,
                    url: args.url
                });
                break;
            case 'clone': await cloneSnippet(subArgs[0], subArgs[1], args.password, token); break;
            case 'user':
                if (subArgs[0] === 'view') await viewUser(token, rawArgs, parseArgs);
                else console.error(`\n❌ Error: Invalid subcommand '${subArgs[0] || ''}' for 'user'.\n`);
                break;
            case 'create': await createSnippet(token, rawArgs, parseArgs); break;
            case 'config': await manageConfig(subArgs); break;
            case 'list': await listSnippets(token, rawArgs, parseArgs); break;
            case 'update': await updateSnippet(subArgs[0], token, rawArgs, parseArgs); break;
            case 'delete': await deleteSnippet(subArgs[0], token); break;
            case 'search': await searchSnippets(subArgs[0], token, rawArgs, parseArgs); break;
            case 'copy': await copySnippet(subArgs[0], token, args); break;
            case 'run': await runSnippet(subArgs[0], subArgs.slice(1).join(' '), token, rawArgs, parseArgs); break;
            case 'stats': await showStats(token); break;
            case 'star': await starSnippet(subArgs[0], token, { unstar: args.unstar }); break;
            case 'restore': await restoreSnippet(subArgs[0], token); break;
            default:
                console.error(`\n❌ Error: Command '${command}' not found.\n`);
                showHelp();
        }
    } catch (error) {
        logger.error('Unhandled error in main function:', error);
        console.error(`\n❌ A fatal error occurred: ${error.message}\n`);
        process.exit(1);
    }
}

main();