const readline = require('readline');

function openCustomTUI(initialContent = '') {
    return new Promise((resolve, reject) => {
        const { stdin, stdout } = process;
        let content = initialContent;
        let cursorPosition = content.length;

        const cleanup = () => {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeAllListeners('data');
            stdout.write('\x1B[?25h'); // Show cursor
        };

        const render = () => {
            readline.cursorTo(stdout, 0, 0);
            readline.clearScreenDown(stdout);
            stdout.write('TeaserPaste Editor | Ctrl+S: Save & Exit | Ctrl+C: Cancel\r\n');
            stdout.write('----------------------------------------------------------\r\n');
            stdout.write(content);
            readline.cursorTo(stdout, cursorPosition, Math.floor(cursorPosition / stdout.columns) + 2);
        };

        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        stdout.write('\x1B[?25l'); // Hide cursor

        render();

        const onData = (key) => {
            switch (key) {
                case '\u0013': // Ctrl+S
                    cleanup();
                    resolve(content);
                    break;
                case '\u0003': // Ctrl+C
                    cleanup();
                    reject(new Error('Thao tác soạn thảo đã bị hủy.'));
                    break;
                case '\x7f': // Backspace
                    if (cursorPosition > 0) {
                        content = content.slice(0, cursorPosition - 1) + content.slice(cursorPosition);
                        cursorPosition--;
                    }
                    break;
                case '\r': // Enter
                    content = content.slice(0, cursorPosition) + '\n' + content.slice(cursorPosition);
                    cursorPosition++;
                    break;
                default: // Regular characters
                    if (key >= ' ') {
                        content = content.slice(0, cursorPosition) + key + content.slice(cursorPosition);
                        cursorPosition++;
                    }
                    break;
            }
            render();
        };

        stdin.on('data', onData);
    });
}

module.exports = { openCustomTUI };
