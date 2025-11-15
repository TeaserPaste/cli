const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Dynamically import the cliedit library (which is ESM)
 * into TeaserPaste CLI (which is CommonJS).
 * @returns {Promise<import('cliedit').openEditor>}
 */
async function getCliedit() {
    try {
        const { openEditor } = await import('cliedit');
        return openEditor;
    } catch (err) {
        console.error("Error: Could not load 'cliedit' dependency.");
        console.error("Please run 'npm install -g teaserpaste-cli' to update.");
        throw err;
    }
}

/**
 * Opens the In-Terminal Editor (using cliedit) by
 * using a temporary file.
 * @param {string} initialContent - Initial content to load into the editor.
 * @returns {Promise<string>} - The final content if saved (Ctrl+S).
 * @throws {Error} - Throws an error if the user cancels (Ctrl+Q).
 */
async function openCustomTUI(initialContent = '') {
    const openEditor = await getCliedit();
    
    // Create a temp file for cliedit to read and write
    const tempFile = path.join(os.tmpdir(), `tp-cliedit-${Date.now()}.tmp`);
    let result = { saved: false, content: initialContent };

    try {
        // 1. Write initial content (if any) to the temp file
        await fs.promises.writeFile(tempFile, initialContent, 'utf-8');

        console.log('\nOpening In-Terminal Editor [Beta]...');
        
        // (GHOST TUI FIX) Add a small delay before entering raw mode
        // to allow the terminal to process.
        await new Promise(res => setTimeout(res, 50));

        // 2. Run cliedit
        result = await openEditor(tempFile);

        // (GHOST TUI FIX) Add a delay after exiting raw mode
        // to prevent display artifacts in the terminal.
        await new Promise(res => setTimeout(res, 50));

    } catch (error) {
        // Ensure the terminal is restored even if there's an error
        await new Promise(res => setTimeout(res, 50));
        console.error(`\nError running cliedit: ${error.message}`);
        throw new Error('Could not start In-Terminal Editor.');
    } finally {
        // 3. Always clean up the temp file
        try {
            await fs.promises.unlink(tempFile);
        } catch (e) {
            // Ignore if the file was already deleted
        }
    }

    // 4. Handle the result
    if (result.saved) {
        // User pressed Ctrl+S
        return result.content;
    } else {
        // User pressed Ctrl+Q (quit without saving)
        // Throw an error so cli.js can catch it as a "cancel"
        throw new Error('Editing operation was canceled.');
    }
}

module.exports = { openCustomTUI };