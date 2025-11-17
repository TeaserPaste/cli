const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: fetch } = require('node-fetch');
const ConfigManager = require('./config-manager');
const logger = require('./logger');
const { spawn } = require('child_process');

const BASE_API_URL = 'https://paste-api.teaserverse.online';
const BASE_WEB_URL = 'https://paste.teaserverse.online';

// --- HANDLERS AND HELPERS ---

// Dynamic import of ESM libraries
async function getInquirer() { const { default: inquirer } = await import('inquirer'); return inquirer; }
async function getClipboardy() { const { default: clipboardy } = await import('clipboardy'); return clipboardy; }

// Read content from stdin
function readFromStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('readable', () => { let chunk; while ((chunk = process.stdin.read()) !== null) { data += chunk; } });
        process.stdin.on('end', () => { resolve(data.trim()); });
    });
}

// --- API request helper ---

async function apiRequest(endpoint, method, body, token = null) {
    const finalToken = token; // Token is now resolved in cli.js
    const headers = { 'Content-Type': 'application/json' };
    if (finalToken) { headers['Authorization'] = `Bearer ${finalToken}`; }

    const startTime = Date.now();
    logger.log(`API Request: ${method} ${BASE_API_URL}${endpoint}`);
    if (body) { logger.log('Request Body:', JSON.stringify(body, null, 2)); }

    const response = await fetch(`${BASE_API_URL}${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const duration = Date.now() - startTime;
    const responseText = await response.text();

    let dataForLog;
    let cacheStatus = '';
    try {
        dataForLog = JSON.parse(responseText);
        if (dataForLog.additional && dataForLog.additional.cache) {
            cacheStatus = ` (cache: ${dataForLog.additional.cache})`;
        }
    } catch (e) {
        dataForLog = responseText; // Not JSON
    }

    logger.log(`API Response Status: ${response.status} (took: ${duration}ms)${cacheStatus}`);
    logger.log('Response Body:', responseText);

    if (!response.ok) {
        try {
            const errorData = (typeof dataForLog === 'object') ? dataForLog : JSON.parse(responseText);
            if (errorData.requiresPassword) throw new Error(`Snippet requires a password.`);
            const errorDetails = errorData.error ? JSON.stringify(errorData) : responseText;
            throw new Error(`API Error (${response.status}): ${errorDetails}`);
        } catch (e) {
            throw new Error(`API Error (${response.status}): ${responseText}`);
        }
    }
    
    try {
        return (typeof dataForLog === 'object') ? dataForLog : JSON.parse(responseText);
    } catch (e) {
        return responseText;
    }
}

// Display functions
function printSnippet(snippet) {
    console.log('\n=====================================');
    console.log(`TEASERPASTE SNIPPET: ${snippet.id}`);
    console.log('=====================================');
    console.log(`Title: ${snippet.title}`);
    if (snippet.isVerified) console.log("⭐ VERIFIED SNIPPET");
    if (snippet.passwordBypassed) console.log("🔑 Password bypassed because you are the owner.");
    console.log(`Creator: ${snippet.creatorName}`);
    console.log(`Language: ${snippet.language}`);
    console.log(`Tags: ${(snippet.tags || []).join(', ')}`);
    console.log(`Visibility: ${snippet.visibility}`);
    console.log('-------------------------------------');
    console.log(snippet.content);
    console.log('-------------------------------------\n');
}

function printUser(user) {
    console.log('\n=====================================');
    console.log(`USER PROFILE: ${user.userId}`);
    console.log('=====================================');
    console.log(`Display Name: ${user.displayName}`);
    console.log(`Photo URL: ${user.photoURL || 'N/A'}`);
    console.log('-------------------------------------\n');
}

// Utility functions
const extensionToLang = { '.js': 'javascript', '.ts': 'typescript', '.py': 'python', '.html': 'html', '.css': 'css', '.json': 'json', '.md': 'markdown', '.txt': 'plaintext', '.sh': 'shell', '.java': 'java', '.cs': 'csharp', '.cpp': 'cpp', '.go': 'go', '.rs': 'rust', '.rb': 'ruby' };
function getFileExtension(language) { const map = { javascript: '.js', typescript: '.ts', python: '.py', html: '.html', css: '.css', json: '.json', markdown: '.md', text: '.txt', plaintext: '.txt', shell: '.sh', java: '.java', csharp: '.cs', cpp: '.cpp', go: '.go', rust: '.rs', ruby: '.rb' }; return map[language ? language.toLowerCase() : 'text'] || '.txt'; }
function getLangFromExtension(ext) { return extensionToLang[ext] || 'plaintext'; }
function sanitizeFilename(name) { if (!name) return 'snippet'; return name.replace(/[\s/\\?%*:|"<>]/g, '_').substring(0, 100); }
function parseDuration(durationStr) {
    if (!durationStr) return undefined;
    const match = durationStr.match(/^(\d+)(ms|s|m|h|d)?$/);
    if (!match) throw new Error(`Invalid duration format: ${durationStr}`);
    const value = parseInt(match[1], 10);
    const unit = match[2] || 'ms';
    const multipliers = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
    return value * multipliers[unit];
}

// Open external editor
async function openExternalEditor(initialContent = '') {
    return new Promise((resolve, reject) => {
        const tempFile = path.join(os.tmpdir(), `tp-editor-${Date.now()}.tmp`);
        fs.writeFileSync(tempFile, initialContent);
        const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vim');
        const child = spawn(editor, [tempFile], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
        console.log(`\nEditor opened. Please save and close it.`);
        const inquirerPromise = getInquirer().then(inquirer => inquirer.prompt([{ type: 'confirm', name: 'done', message: 'Press Enter when you are done editing:' }]));
        inquirerPromise.then(answers => {
            if (answers.done) {
                 const content = fs.readFileSync(tempFile, 'utf-8');
                 fs.unlinkSync(tempFile);
                 resolve(content);
            } else {
                 fs.unlinkSync(tempFile);
                 reject(new Error(`Editing operation was canceled.`));
            }
        });
        child.on('error', (err) => {
             fs.unlinkSync(tempFile);
             reject(err);
        });
    });
}

module.exports = {
    BASE_API_URL,
    BASE_WEB_URL,
    getInquirer,
    getClipboardy,
    readFromStdin,
    apiRequest,
    printSnippet,
    printUser,
    extensionToLang,
    getFileExtension,
    getLangFromExtension,
    sanitizeFilename,
    parseDuration,
    openExternalEditor
};