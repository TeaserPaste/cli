const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const ConfigManager = require('./config-manager');
const logger = require('./logger');
const { openCustomTUI } = require('./custom-editor');
const {
    BASE_API_URL,
    BASE_WEB_URL,
    getInquirer,
    getClipboardy,
    readFromStdin,
    apiRequest,
    printSnippet,
    printUser,
    getFileExtension,
    getLangFromExtension,
    sanitizeFilename,
    parseDuration,
    openExternalEditor
} = require('./api');

// --- COMMAND LOGIC ---

async function viewSnippet(id, token, password, { raw, copy, url: urlFlag }) {
    if (!id) {
        console.error('\n❌ Error: Missing snippet ID for \'view\' command.\n');
        return;
    }

    if (urlFlag) {
        const url = `${BASE_WEB_URL}/snippet/${id}`;
        console.log(`\n${url}\n`);
        return;
    }
    
    try {
        const snippet = await apiRequest('/getSnippet', 'POST', { snippetId: id, password }, token);
        
        if (raw) {
            process.stdout.write(snippet.content);
            return;
        }

        if (copy) {
            const clipboardy = await getClipboardy();
            await clipboardy.write(snippet.content);
            console.log('\n✅ Copied snippet content to clipboard!\n');
            return;
        }
        
        printSnippet(snippet);
    } catch (error) { console.error(`\n❌ Error: ${error.message}\n`); }
}

async function viewUser(token, rawArgs, parseArgs) {
    try {
        const parsedArgs = parseArgs(rawArgs);
        const user = await apiRequest('/getUserInfo', 'GET', null, token);
        printUser(user);
        if (parsedArgs.s) {
            console.log(`Loading public snippets for ${user.displayName}...`);
            const snippets = await apiRequest('/getUserPublicSnippets', 'POST', { userId: user.userId });
            if (!snippets || snippets.length === 0) {
                console.log('\nThis user has no public snippets.\n');
                return;
            }
            console.log('\nPublic Snippets:');
            console.table(snippets.map(s => ({ ID: s.id, TITLE: s.title, LANGUAGE: s.language })));
        }
    } catch (error) { console.error(`\n❌ Error: ${error.message}\n`); }
}

async function createSnippet(token, rawArgs, parseArgs) {
    try {
        let snippetData = {};
        const parsedArgs = parseArgs(rawArgs);
        const isInteractive = parsedArgs.i || parsedArgs.interactive;
        const hasContentFlag = parsedArgs.content;
        const hasFileFlag = parsedArgs.file;
        const inquirer = await getInquirer();

        if (isInteractive) {
            let answers = await inquirer.prompt([
                { type: 'input', name: 'title', message: 'Snippet title:', default: 'Untitled' },
                { type: 'input', name: 'language', message: 'Language:', default: 'plaintext' },
                { type: 'list', name: 'visibility', message: 'Visibility:', choices: ['unlisted', 'public', 'private'], default: 'unlisted' },
                { type: 'input', name: 'password', message: 'Password (optional):', when: (ans) => ans.visibility === 'unlisted' },
                { type: 'input', name: 'tags', message: 'Tags (comma-separated):' },
                { type: 'input', name: 'expires', message: 'Expiration (e.g., 1h, 7d, 2w):' },
                { type: 'list', name: 'contentSource', message: 'Content source:', choices: ['Open default editor', 'Import from file', 'In-Terminal Editor [Beta]'], default: 0 },
            ]);

            if (answers.contentSource === 'Import from file') {
                const { filePath } = await inquirer.prompt([{ type: 'input', name: 'filePath', message: 'Path to file:' }]);
                if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
                answers.content = fs.readFileSync(filePath, 'utf-8');
            } else if (answers.contentSource === 'In-Terminal Editor [Beta]') {
                answers.content = await openCustomTUI();
            } else {
                 console.log('\nPreparing to open default editor...');
                 answers.content = await openExternalEditor();
            }
            snippetData = answers;

        } else if (hasFileFlag) {
            if (!fs.existsSync(hasFileFlag)) throw new Error(`File not found: ${hasFileFlag}`);
            const fileContent = fs.readFileSync(hasFileFlag, 'utf-8');
            const fileExt = path.extname(hasFileFlag);
            const langFromFile = getLangFromExtension(fileExt);

            snippetData = { ...parsedArgs, content: fileContent };

            if (!parsedArgs.language && langFromFile !== 'plaintext') {
                snippetData.language = langFromFile;
                console.log(`ℹ️ Auto-detected language: ${langFromFile}`);
            }

        } else if (!process.stdin.isTTY && !hasContentFlag) {
            snippetData.content = await readFromStdin();
            snippetData = { ...parsedArgs, ...snippetData };

        } else {
            if (!parsedArgs.title || !parsedArgs.content) return console.error(`\n❌ Error: Missing --title and --content. Use -i (interactive) or --file <path>.\n`);
            snippetData = parsedArgs;
        }

        snippetData.tags = (snippetData.tags || '').split(',').map(t => t.trim()).filter(Boolean);
        const newSnippet = await apiRequest('/createSnippet', 'POST', snippetData, token);
        console.log(`\n✅ Successfully created snippet! ID: ${newSnippet.id}\n`);

    } catch (error) {
        if (error.message.includes('prompt was canceled') || error.message.includes('Editing operation was canceled')) {
            console.log('\nOperation canceled.\n');
        } else {
            console.error(`\n❌ Error: ${error.message}\n`);
        }
    }
}

async function listSnippets(token, rawArgs, parseArgs) {
    try {
        const parsedArgs = parseArgs(rawArgs);
        const includeDeleted = parsedArgs.d || parsedArgs.includeDeleted || false;

        const snippets = await apiRequest('/listSnippets', 'POST', { 
            limit: parsedArgs.limit ? parseInt(parsedArgs.limit, 10) : 20, 
            visibility: parsedArgs.visibility,
            includeDeleted: includeDeleted
        }, token);
        
        if (!snippets || snippets.length === 0) {
            console.log('\nNo snippets found.\n');
            return;
        }
        console.table(snippets.map(s => ({ ID: s.id, TITLE: s.title, VISIBILITY: s.visibility, LANGUAGE: s.language })));
    } catch (error) { console.error(`\n❌ Error: ${error.message}\n`); }
}

async function cloneSnippet(id, filename, password, token) {
    if (!id) {
        console.error('\n❌ Error: Missing snippet ID for \'clone\' command.\n');
        return;
    }
    try {
        const snippet = await apiRequest('/getSnippet', 'POST', { snippetId: id, password }, token);
        const correctExtension = getFileExtension(snippet.language);
        let baseFilename = filename;
        if (filename) {
            const userExtension = path.extname(filename);
            if (userExtension && userExtension !== correctExtension) {
                console.warn(`\n⚠️ Warning: File extension ('${userExtension}') doesn't match language ('${snippet.language}'). Saving with correct extension '${correctExtension}'.\n`);
                baseFilename = path.basename(filename, userExtension);
            } else if (!userExtension) { baseFilename = filename; }
        } else { baseFilename = sanitizeFilename(snippet.title); }
        const outputFilename = baseFilename + correctExtension;
        fs.writeFileSync(outputFilename, snippet.content);
        console.log(`\n✅ Snippet successfully saved to file: ${outputFilename}\n`);
    } catch (error) { console.error(`\n❌ Error: ${error.message}\n`); }
}

async function updateSnippet(id, token, rawArgs, parseArgs) {
    if (!id) {
        console.error('\n❌ Error: Missing snippet ID for \'update\' command.\n');
        return;
    }
    try {
        const parsedArgs = parseArgs(rawArgs);
        delete parsedArgs['_']; delete parsedArgs.token;
        delete parsedArgs.d; delete parsedArgs.includeDeleted;

        if (Object.keys(parsedArgs).length === 0) {
            console.error('\n❌ Error: Must provide at least one field to update (e.g., --title "New Title").\n');
            return;
        }
        if (typeof parsedArgs.tags === 'string') {
             parsedArgs.tags = parsedArgs.tags.split(',').map(t => t.trim()).filter(Boolean);
        }

        const updatedSnippet = await apiRequest('/updateSnippet', 'PATCH', { snippetId: id, updates: parsedArgs }, token);
        console.log(`\n✅ Snippet successfully updated!`);
        printSnippet(updatedSnippet);
    } catch (error) { console.error(`\n❌ Error: ${error.message}\n`); }
}

async function deleteSnippet(id, token) {
    if (!id) {
        console.error('\n❌ Error: Missing snippet ID for \'delete\' command.\n');
        return;
    }
    try {
        const inquirer = await getInquirer();
        const { confirmDelete } = await inquirer.prompt([{ type: 'confirm', name: 'confirmDelete', message: `Are you sure you want to delete snippet '${id}'?`, default: false }]);
        if (confirmDelete) {
            const result = await apiRequest('/deleteSnippet', 'DELETE', { snippetId: id }, token);
            console.log(`\n✅ ${result.message}\n`);
        } else { console.log('\nDelete operation canceled.\n'); }
    } catch (error) {
         if (error.message.includes('prompt was canceled')) {
            console.log('\nExited interactive mode.\n');
         }
         else {
            console.error(`\n❌ Error: ${error.message}\n`);
         }
    }
}

async function restoreSnippet(id, token) {
    if (!id) {
        console.error('\n❌ Error: Missing snippet ID for \'restore\' command.\n');
        return;
    }
    if (!token) {
        console.error('\n❌ Error: \'restore\' command requires authentication. Please use `tp config set token <token>` or provide `--token`.\n');
        return;
    }
    try {
        const inquirer = await getInquirer();
        const { confirm } = await inquirer.prompt([{ type: 'confirm', name: 'confirm', message: `Are you sure you want to restore snippet '${id}' from the trash?`, default: true }]);
        if (!confirm) {
            console.log('\nOperation canceled.\n');
            return;
        }
        const result = await apiRequest('/restoreSnippet', 'POST', { snippetId: id }, token);
        console.log(`\n✅ ${result.message}\n`);
    } catch (error) {
        if (error.message.includes('prompt was canceled')) {
            console.log('\nExited interactive mode.\n');
        } else {
            console.error(`\n❌ Error restoring snippet: ${error.message}\n`);
        }
    }
}

async function starSnippet(id, token, { unstar = false }) {
    if (!id) {
        console.error('\n❌ Error: Missing snippet ID for \'star\' command.\n');
        return;
    }
    if (!token) {
        console.error('\n❌ Error: \'star\' command requires authentication. Please use `tp config set token <token>` or provide `--token`.\n');
        return;
    }

    try {
        const star = !unstar;
        const result = await apiRequest('/starSnippet', 'POST', { snippetId: id, star: star }, token);
        
        if (result.status === 'starred') {
            console.log(`\n⭐ Snippet starred! (Total stars: ${result.starCount})\n`);
        } else if (result.status === 'unstarred') {
            console.log(`\n💔 Snippet unstarred. (Total stars: ${result.starCount})\n`);
        } else if (result.status === 'already_starred' || result.status === 'already_unstarred') {
            console.log(`\nℹ️ Snippet was already in this state. (Total stars: ${result.starCount})\n`);
        } else {
             console.log(`\n✅ Star status updated. (Total stars: ${result.starCount})\n`);
        }

    } catch (error) {
        console.error(`\n❌ Error starring snippet: ${error.message}\n`);
    }
}

async function searchSnippets(term, token, rawArgs, parseArgs) {
    if (!term) {
        console.error('\n❌ Error: Missing search term for \'search\' command.\n');
        return;
    }
    try {
        const parsedArgs = parseArgs(rawArgs);
        const limit = parsedArgs.limit ? parseInt(parsedArgs.limit, 10) : 10;
        const from = parsedArgs.from ? parseInt(parsedArgs.from, 10) : 0;
        console.log(`\nSearching for "${term}" (limit: ${limit}, from: ${from})...`);
        
        const results = await apiRequest('/searchSnippets', 'POST', {
            term,
            size: limit,
            from
        }, token);

        if (!results || !results.hits || results.hits.length === 0) {
            console.log('\nNo matching results found.\n');
            return;
        }
        console.log(`\nFound ${results.total} total results. Displaying ${results.hits.length} results:`);
        console.table(results.hits.map(hit => ({
            ID: hit.id,
            TITLE: hit.title,
            CREATOR: hit.creatorName,
            LANGUAGE: hit.language,
        })));
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
    }
}

async function copySnippet(id, token, args) {
    if (!id) {
        console.error('\n❌ Error: Missing snippet ID for \'copy\' command.\n');
        return;
    }
    if (!token) {
        console.error('\n❌ Error: \'copy\' command requires authentication (private key). Please use `tp config set token <token>`.\n');
        return;
    }

    try {
        const parsedArgs = args; // Args are already parsed in cli.js
        
        console.log(`\nSending "copy" (fork) request for snippet '${id}'...`);
        
        const result = await apiRequest('/copySnippet', 'POST', { 
            snippetId: id,
            password: parsedArgs.password // Pass password to allow copying unlisted snippets
        }, token);

        console.log(`\n✅ ${result.message}`);
        console.log(`New snippet ID (private): ${result.newSnippetId}`);
        const url = `${BASE_WEB_URL}/snippet/${result.newSnippetId}`;
        console.log(`URL: ${url}\n`);

    } catch (error) {
        console.error(`\n❌ Error copying snippet: ${error.message}\n`);
    }
}

// --- Helpers for runSnippet ---

function execute(command, commandArgs, options) {
    return new Promise((resolve, reject) => {
        const { parsedArgs, token, snippetId } = options;

        const spawnOptions = {
            timeout: parseDuration(parsedArgs.timeout),
            stdio: ['inherit', 'inherit', 'inherit'],
            env: { ...process.env, ...parsedArgs.env },
            cwd: options.cwd
        };

        if (parsedArgs['input-file']) spawnOptions.stdio[0] = 'pipe';
        if (parsedArgs['output-file'] || parsedArgs['copy-result'] || parsedArgs['on-error-paste']) {
            spawnOptions.stdio[1] = 'pipe';
        }
        if (parsedArgs['on-error-paste']) {
            spawnOptions.stdio[2] = 'pipe';
        }

        if (!parsedArgs.silent && !parsedArgs.s) {
            console.log(`\n> Running: ${command} ${commandArgs.join(' ')} (in ${options.cwd})\n`);
        }
        let child;
        try {
            child = spawn(command, commandArgs, spawnOptions);
        } catch (error) {
            return reject(error);
        }

        if (spawnOptions.stdio[0] === 'pipe') {
            if (!fs.existsSync(parsedArgs['input-file'])) {
                return reject(new Error(`Input file not found: ${parsedArgs['input-file']}`));
            }
            const inputStream = fs.createReadStream(parsedArgs['input-file']);
            inputStream.pipe(child.stdin);
        }

        let outputBuffer = '';
        let errorBuffer = '';

        if (spawnOptions.stdio[1] === 'pipe') {
            child.stdout.on('data', (data) => {
                const dataStr = data.toString();
                if (!parsedArgs['output-file']) {
                    process.stdout.write(data);
                }
                if (parsedArgs['copy-result'] || parsedArgs['on-error-paste']) {
                    outputBuffer += dataStr;
                }
            });
            if (parsedArgs['output-file']) {
                const outputStream = fs.createWriteStream(parsedArgs['output-file']);
                child.stdout.pipe(outputStream);
            }
        }

        if (spawnOptions.stdio[2] === 'pipe') {
            child.stderr.on('data', (data) => {
                const dataStr = data.toString();
                process.stderr.write(data);
                errorBuffer += dataStr;
            });
        }

        child.on('close', async (code) => {
            if (code !== 0) {
                if (parsedArgs['on-error-paste']) {
                    const errorContent = `--- STDOUT ---\n${outputBuffer}\n--- STDERR ---\n${errorBuffer}`;
                    try {
                        const newSnippet = await apiRequest('/createSnippet', 'POST', {
                            content: errorContent,
                            title: `Execution Error [TP RUN] for snippet ${snippetId}`,
                            visibility: 'private'
                        }, token);
                        if (!parsedArgs.silent && !parsedArgs.s) {
                            console.log(`\n❌ Script failed. Error log saved to private snippet: ${newSnippet.id}\n`);
                        }
                    } catch (apiError) {
                        if (!parsedArgs.silent && !parsedArgs.s) {
                            console.error(`\n❌ Script failed and could not create error snippet: ${apiError.message}\n`);
                        }
                    }
                }
                return reject(new Error(`Process exited with code: ${code}`));
            }

            if (parsedArgs['copy-result']) {
                const clipboardy = await getClipboardy();
                await clipboardy.write(outputBuffer);
                if (!parsedArgs.silent && !parsedArgs.s) {
                    console.log('\n✅ Copied result to clipboard!\n');
                }
            }
            resolve({ code });
        });

        child.on('error', (err) => {
            if (err.name === 'AbortError' || (err.signal === 'SIGTERM' && parsedArgs.timeout)) {
                reject(new Error(`Process was terminated due to timeout (${parsedArgs.timeout}).`));
            } else {
                reject(err);
            }
        });
    });
}
async function installDependencies(deps, language, cwd, parsedArgs = {}) {
    return new Promise((resolve, reject) => {
        const lang = language ? language.toLowerCase() : 'plaintext';
        let command;
        let args;

        if (lang === 'javascript' || lang === 'typescript') {
            command = 'npm';
            args = ['install', ...deps];
        } else if (lang === 'python') {
            command = 'pip';
            args = ['install', '-t', '.', ...deps];
        } else {
            return reject(new Error(`Dependency installation not supported for ${language}`));
        }

        if (!parsedArgs.silent && !parsedArgs.s) {
            console.log(`\n> Installing dependencies: ${command} ${args.join(' ')}\n`);
        }
        const child = spawn(command, args, { stdio: 'inherit', cwd });
        child.on('close', (code) => {
            if (code !== 0) return reject(new Error(`Dependency installation failed with code ${code}`));
            resolve();
        });
        child.on('error', (err) => reject(err));
    });
}
async function detectDependencies(content, language) {
    const lang = language ? language.toLowerCase() : 'plaintext';
    let regex;
    if (lang === 'javascript' || lang === 'typescript') {
        regex = /(?:require\(['"]([^'"]+)['"]\)|import\s+.*?from\s+['"]([^'"]+)['"])/g;
    } else if (lang === 'python') {
        regex = /(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))/g;
    } else {
        return [];
    }
    const matches = [...content.matchAll(regex)];
    const deps = new Set();
    matches.forEach(match => {
        const dep = match[1] || match[2];
        if (dep && !dep.startsWith('./') && !dep.startsWith('../')) {
            deps.add(dep);
        }
    });
    return Array.from(deps);
}
// --- End Helpers for runSnippet ---


async function runSnippet(id, customStartup, token, rawArgs, parseArgs) {
    if (!id) {
        console.error('\n❌ Error: Missing snippet ID for \'run\' command.\n');
        return;
    }
    const parsedArgs = parseArgs(rawArgs);
    if (!parsedArgs.force && !parsedArgs.f) {
        const inquirer = await getInquirer();
        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: '⚠️ Warning: You are about to execute code from the internet. This can be dangerous. Are you sure you want to continue?',
            default: false,
        }]);
        if (!confirm) {
            console.log('\nOperation canceled.\n');
            return;
        }
    }

    let tempDir = null;
    const cleanup = () => {
        setTimeout(() => {
            if (tempDir && fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                logger.log(`Cleaned up temp directory: ${tempDir}`);
            }
        }, 100); // 100ms delay to allow file locks to be released
    };

    try {
        const snippet = await apiRequest('/getSnippet', 'POST', { snippetId: id, password: parsedArgs.password }, token);

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `tp-run-${Date.now()}`));
        
        let executableFile;
        let cwd;
        const language = snippet.language;
        cwd = tempDir;

        const contentForDepDetection = snippet.content;

        if (parsedArgs['install-deps']) {
            const deps = await detectDependencies(contentForDepDetection, language);
            if (deps.length > 0) {
                const inquirer = await getInquirer();
                const { confirm } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'confirm',
                    message: `Detected dependencies: ${deps.join(', ')}. Do you want to install them in a temporary environment?`,
                    default: true,
                }]);
                if (confirm) {
                    await installDependencies(deps, language, tempDir, parsedArgs);
                }
            }
        }

        const extension = getFileExtension(language);
        executableFile = path.join(tempDir, `snippet${extension}`);
        fs.writeFileSync(executableFile, snippet.content);
        
        const executeOptions = { parsedArgs, token, snippetId: id, cwd };

        if (customStartup) {
            const startupParts = customStartup.split(' ');
            const snippetIndex = startupParts.indexOf('--snippet');
            if (snippetIndex > -1) startupParts[snippetIndex] = executableFile;
            else startupParts.push(executableFile);
            const command = startupParts[0];
            const commandArgs = startupParts.slice(1);
            await execute(command, commandArgs, executeOptions);
        } else {
            const lang = language ? language.toLowerCase() : 'plaintext';
            const langToCommand = {
                python: 'python', javascript: 'node', shell: 'bash',
                typescript: 'ts-node', ruby: 'ruby', perl: 'perl',
                php: 'php', go: 'go run', rust: 'rustc',
                c: 'gcc', cpp: 'g++', java: 'javac',
            };
            if (!langToCommand[lang]) {
                throw new Error(`Language '${language}' is not supported for auto-run.`);
            }

            const [command, ...args] = langToCommand[lang].split(' ');
            
            if (['c', 'cpp', 'rust', 'java'].includes(lang)) {
                const compileArgs = [...args, executableFile];
                if (lang !== 'java') {
                    const exePath = path.join(cwd, path.basename(executableFile, path.extname(executableFile)));
                    compileArgs.push('-o', exePath);
                }
                
                if (!parsedArgs.silent && !parsedArgs.s) {
                    console.log(`\n> Compiling: ${command} ${compileArgs.join(' ')}\n`);
                }
                const compileProcess = spawn(command, compileArgs, { stdio: 'inherit', cwd });

                compileProcess.on('close', async (code) => {
                    if (code !== 0) {
                        if (!parsedArgs.silent && !parsedArgs.s) {
                            console.error(`\n❌ Compilation error with exit code: ${code}\n`);
                        }
                        cleanup();
                        return;
                    }
                    try {
                        let runCommand, runArgs;
                        if (lang === 'java') {
                            runCommand = 'java';
                            runArgs = ['-cp', cwd, path.basename(executableFile, '.java')];
                        } else {
                            runCommand = path.join(cwd, path.basename(executableFile, path.extname(executableFile)));
                            runArgs = [];
                        }
                        await execute(runCommand, runArgs, executeOptions);
                        if (!parsedArgs.silent && !parsedArgs.s) {
                            console.log(`\n> Execution process finished.\n`);
                        }
                    } catch (execError) {
                        if (!parsedArgs.silent && !parsedArgs.s) {
                            console.error(`\n❌ Error during execution: ${execError.message}\n`);
                        }
                    } finally {
                        cleanup();
                    }
                });
            } else {
                await execute(command, [...args, executableFile], executeOptions);
                if (!parsedArgs.silent && !parsedArgs.s) {
                    console.log(`\n> Process finished.\n`);
                }
                cleanup();
            }
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
        cleanup();
    }
}

async function showStats(token) {
    try {
        console.log('\nLoading statistics...');
        const userInfo = await apiRequest('/getUserInfo', 'GET', null, token);
        const allSnippets = await apiRequest('/listSnippets', 'POST', { limit: 500, includeDeleted: true }, token); 

        if (!allSnippets || allSnippets.length === 0) {
            console.log('You do not have any snippets to display stats for.');
            return;
        }

        const totalSnippets = allSnippets.length;

        const visibilityCounts = allSnippets.reduce((acc, snippet) => {
            acc[snippet.visibility] = (acc[snippet.visibility] || 0) + 1;
            return acc;
        }, {});

        const languageCounts = allSnippets.reduce((acc, snippet) => {
            const lang = snippet.language || 'N/A';
            acc[lang] = (acc[lang] || 0) + 1;
            return acc;
        }, {});

        const top5Languages = Object.entries(languageCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([language, count]) => ({ language, count }));

        console.log(`\n--- STATISTICS FOR USER: ${userInfo.displayName} ---`);

        console.log('\n📊 Overview');
        console.table([{
            'Total Snippets': totalSnippets,
            'Public': visibilityCounts.public || 0,
            'Unlisted': visibilityCounts.unlisted || 0,
            'Private': visibilityCounts.private || 0,
            'Deleted (In Trash)': visibilityCounts.deleted || 0,
        }]);

        console.log('\n🌐 Top 5 Languages');
        console.table(top5Languages);

    } catch (error) {
        console.error(`\n❌ Error loading statistics: ${error.message}\n`);
    }
}

async function manageConfig(args) {
    const [action, key, value] = args;
    if (!action) {
        console.log(`\nUsage: tp config <set|get|clear> token [value]\n`);
        return;
    }
    switch (action.toLowerCase()) {
        case 'set':
            if (key === 'token' && value) {
                try {
                    await ConfigManager.setToken(value);
                    console.log('\n✅ Token has been saved securely!\n');
                } catch (error) {
                    console.error(`\n❌ Error: ${error.message}\n`);
                }
            } else {
                console.error('\n❌ Error: Invalid syntax. Use: tp config set token <your_private_token>\n');
            }
            break;
        case 'get':
            if (key === 'token') {
                const token = await ConfigManager.getToken();
                console.log(token ? `\n🔑 Current Token: ${token}\n` : '\nYou have not set a token.\n');
            }
            break;
        case 'clear':
            if (key === 'token') {
                await ConfigManager.clearToken();
                console.log('\n✅ Token has been cleared.\n');
            }
            break;
        default:
            console.error(`\n❌ Error: Invalid action '${action}'.\n`);
    }
}

module.exports = {
    viewSnippet,
    viewUser,
    createSnippet,
    listSnippets,
    cloneSnippet,
    updateSnippet,
    deleteSnippet,
    restoreSnippet,
    starSnippet,
    searchSnippets,
    copySnippet,
    runSnippet,
    showStats,
    manageConfig,
    execute,
    installDependencies,
    detectDependencies
};