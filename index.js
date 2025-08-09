const express = require("express");
const http = require('http'); // Import http for creating server
const WebSocket = require('ws'); // Import WebSocket library
const pty = require('node-pty'); // Import node-pty for pseudo-terminal management
const { spawn } = require("child_process"); // Import spawn for interactive processes (exec is moved)

// Import route modules
const dockerRoutes = require('./dockerRoutes');
// Removed: const kubernetesRoutes = require('./kubernetesRoutes');
// Removed: const { handleKubernetesWebSocketConnection } = require('./kubernetesConfiguration');

const app = express();
const port = 3000;

// Define API_BASE_URL for backend fetch calls
// This ensures that the backend knows its own address when making requests to its own routes.
const API_BASE_URL = `http://localhost:${port}`;


// Middleware to parse JSON request bodies
app.use(express.json());

// Create an HTTP server and attach Express app to it
const server = http.createServer(app);

// Create a WebSocket server and attach it to the same HTTP server
const wss = new WebSocket.Server({ server });

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Use the Docker routes
app.use('/', dockerRoutes);

// Removed: Use the Kubernetes routes
// app.use('/', kubernetesRoutes);

// WebSocket connection handling for container CLI and Logs
wss.on('connection', function connection(ws, req) {
    // Extract container name and type from the WebSocket URL query string
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const containerName = urlParams.get('cname'); // Used for Docker CLI/Logs
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
    } else { // Fallback for invalid type
        console.error('WebSocket: Invalid connection type provided.');
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid WebSocket connection type.' }));
            ws.close();
        }
    }
});

// Start the server (both Express and WebSocket)
server.listen(port, function() {
    console.log(`Server started successfully on port ${port}...`);
    console.log(`Access the Docker app at http://localhost:${port}/container`);
    // Removed: console.log(`Access the Kubernetes app at http://localhost:${port}/kubernetes`);
});
