let isDebug = false;

/**
 * Initializes the logger. Called once from cli.js.
 * @param {boolean} debugFlag - True if the --debug flag is enabled.
 */
function init(debugFlag) {
    isDebug = !!debugFlag;
}

/**
 * Logs to the console if debug mode is enabled.
 * @param {...any} args - Arguments to log.
 */
function log(...args) {
    if (isDebug) {
        console.log('[DEBUG]', ...args);
    }
}

/**
 * Logs an error to the console if debug mode is enabled.
 * @param {...any} args - Error arguments to log.
 */
function error(...args) {
     if (isDebug) {
        console.error('[DEBUG ERROR]', ...args);
    }
}

module.exports = {
    init,
    log,
    error,
};