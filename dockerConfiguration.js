// dockerConfiguration.js

const pty = require('node-pty'); // Import node-pty for pseudo-terminal management
const { spawn } = require("child_process"); // Import spawn for interactive processes

/**
 * Configures WebSocket connections specifically for Docker CLI and log streaming.
 * @param {WebSocket.Server} wss - The WebSocket server instance.
 */
function configureDockerWebSockets(wss) {
    wss.on('connection', function connection(ws, req) {
        const urlParams = new URLSearchParams(req.url.split('?')[1]);
        const containerName = urlParams.get('cname');
        const type = urlParams.get('type'); // 'cli' or 'logs'

        if (type === 'cli') {
            if (!containerName) {
                console.error('WebSocket: Container name not provided for Docker CLI.');
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Container name is required for Docker CLI.' }));
                    ws.close();
                }
                return;
            }
            console.log(`WebSocket: Client connected for Docker CLI: ${containerName}`);

            let term;
            let ptyExited = false; // Flag to track if the PTY process has exited

            // Function to clean up PTY listeners and nullify term reference
            const cleanupPtyResources = () => {
                if (term) {
                    term.removeAllListeners('data');
                    term.removeAllListeners('exit');
                    // Only kill if it hasn't exited naturally
                    if (!ptyExited) {
                        try {
                            term.kill(); // Attempt to kill the process
                        } catch (killError) {
                            console.error(`Error killing PTY process for ${containerName}:`, killError);
                        }
                    }
                    term = null; // Explicitly nullify the reference
                }
            };

            try {
                term = pty.spawn('docker', ['exec', '-it', containerName, 'bash'], {
                    name: 'xterm-color',
                    cols: 80,
                    rows: 24,
                    cwd: process.env.HOME,
                    env: process.env
                });

                term.onData(data => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(data);
                    }
                });

                term.onExit(({ exitCode, signal }) => {
                    console.log(`WebSocket: Container CLI process exited for ${containerName}. Code: ${exitCode}, Signal: ${signal}`);
                    ptyExited = true; // Set flag that PTY has exited
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send('\r\n\x1b[31mCLI session ended.\x1b[0m\r\n'); // Inform client
                        ws.close(); // Close WebSocket from server side
                    }
                    cleanupPtyResources(); // Clean up listeners and nullify after exit
                });

                ws.on('message', message => {
                    // Only write if term is valid and hasn't exited
                    if (term && !ptyExited) {
                        try {
                            const parsedMessage = JSON.parse(message);
                            if (parsedMessage.type === 'resize') {
                                term.resize(parsedMessage.cols, parsedMessage.rows);
                            } else if (parsedMessage.type === 'input') {
                                term.write(parsedMessage.data);
                            } else {
                                // Fallback for non-structured messages
                                term.write(message.toString());
                            }
                        } catch (e) {
                            console.error(`Error parsing WebSocket message for ${containerName}:`, e);
                            // If parsing fails, treat as raw input
                            term.write(message.toString());
                        }
                    } else {
                        console.warn(`Attempted to write to an invalid or exited PTY for ${containerName}. Ignoring message.`);
                    }
                });

                ws.on('close', () => {
                    console.log(`WebSocket: Client disconnected for CLI of container: ${containerName}.`);
                    // When client disconnects, ensure PTY resources are cleaned up
                    cleanupPtyResources();
                });

                ws.on('error', error => {
                    console.error(`WebSocket error for CLI of ${containerName}:`, error);
                    // On WebSocket error, clean up PTY resources
                    cleanupPtyResources();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'error', message: `WebSocket error: ${error.message}` }));
                        ws.close();
                    }
                });

            } catch (ptyError) {
                console.error(`Error spawning PTY for container ${containerName}:`, ptyError);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', message: `Failed to open CLI: ${ptyError.message}` }));
                    ws.close();
                }
                cleanupPtyResources(); // Clean up if PTY spawn itself fails
            }
        } else if (type === 'logs') {
            if (!containerName) {
                console.error('WebSocket: Container name not provided for Docker logs.');
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Container name is required for Docker logs.' }));
                    ws.close();
                }
                return;
            }
            console.log(`WebSocket: Client connected for Docker logs: ${containerName}`);

            let logProcess;
            let logProcessExited = false;

            // Function to clean up log process listeners and nullify reference
            const cleanupLogProcessResources = () => {
                if (logProcess) {
                    logProcess.stdout.removeAllListeners('data');
                    logProcess.stderr.removeAllListeners('data');
                    logProcess.removeAllListeners('close');
                    logProcess.removeAllListeners('error');
                    // Only kill if it hasn't exited naturally
                    if (!logProcessExited) {
                        try {
                            logProcess.kill(); // Attempt to kill the process
                        } catch (killError) {
                            console.error(`Error killing log process for ${containerName}:`, killError);
                        }
                    }
                    logProcess = null; // Explicitly nullify the reference
                }
            };

            try {
                logProcess = spawn('docker', ['logs', '-f', containerName]);

                logProcess.stdout.on('data', (data) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(data.toString());
                    }
                });

                logProcess.stderr.on('data', (data) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(`\x1b[31m${data.toString()}\x1b[0m`);
                    }
                });

                logProcess.on('close', (code) => {
                    console.log(`WebSocket: 'docker logs -f' process for ${containerName} exited with code ${code}.`);
                    logProcessExited = true; // Set flag that log process has exited
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(`\r\n\x1b[31mLog stream ended (process exited with code ${code}).\x1b[0m\r\n`);
                        ws.close(); // Close WebSocket from server side
                    }
                    cleanupLogProcessResources(); // Clean up listeners and nullify after close
                });

                logProcess.on('error', (err) => {
                    console.error(`WebSocket: Error in 'docker logs -f' process for ${containerName}:`, err);
                    logProcessExited = true; // Set flag
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(`\r\n\x1b[31mError in log stream: ${err.message}\x1b[0m\r\n`);
                        ws.close(); // Close WebSocket from server side
                    }
                    cleanupLogProcessResources(); // Clean up listeners and nullify after error
                });

                ws.on('close', () => {
                    console.log(`WebSocket: Client disconnected from logs of container: ${containerName}.`);
                    // When client disconnects, ensure log process resources are cleaned up
                    cleanupLogProcessResources();
                });

                ws.on('error', (error) => {
                    console.error(`WebSocket error for logs of ${containerName}:`, error);
                    // On WebSocket error, clean up log process resources
                    cleanupLogProcessResources();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'error', message: `WebSocket error: ${error.message}` }));
                        ws.close();
                    }
                });

            } catch (logSpawnError) {
                console.error(`Error spawning 'docker logs -f' for container ${containerName}:`, logSpawnError);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', message: `Failed to open log stream: ${logSpawnError.message}` }));
                    ws.close();
                }
                cleanupLogProcessResources(); // Clean up if log spawn itself fails
            }
        }
    });
}

module.exports = { configureDockerWebSockets };
