# Docker Web Management UI

A simple and intuitive web-based user interface to manage Docker containers and images. This application provides a dashboard to view running and stopped containers, manage local images, and interact with containers through a web-based terminal.

---

## Features

* **Container Management:**
    * List all running and stopped containers.
    * Start, stop, and remove multiple containers at once.
    * Launch new containers from available local images.
    * Specify container name, number of instances, environment variables, and port mappings at launch.
    * Rename existing containers.
    * View detailed container information (similar to `docker inspect`).
    * View real-time statistics for one or more containers (CPU, Memory, etc.).

* **Image Management:**
    * List all locally available Docker images.
    * Pull new images from Docker Hub.
    * Remove one or more local images.

* **Interactive Terminal:**
    * Open an interactive `bash` shell directly into a running container from the web UI.
    * The terminal is fully functional, powered by `xterm.js` and `node-pty`.

* **Log Streaming:**
    * View real-time logs from any running container.

---

## Tech Stack

* **Backend:** Node.js, Express.js
* **Frontend:** HTML, CSS, JavaScript, Tailwind CSS
* **Real-time Communication:** WebSockets (`ws`)
* **Terminal Emulation:** `node-pty`, `xterm.js`
* **Docker Interaction:** Node.js `child_process` (exec, spawn)

---

## Prerequisites

Before you begin, ensure you have the following installed on your system:

* [Node.js](https://nodejs.org/en/) (v14 or later recommended)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine

---

## Installation & Setup

1.  **Install dependencies:**
    Open your terminal in the project root and run:
    ```bash
    npm install
    ```

2.  **Start the server:**
    ```bash
    node index.js / nodemon index.js
    ```
    *Note: The `package.json` has a start script `nodemon server.js`. If you have `nodemon` installed globally (`npm install -g nodemon`), you can use `npm start` for automatic server restarts on file changes. Make sure to change `server.js` to `index.js` in your `package.json` if you prefer this method.*

4.  **Access the application:**
    Open your web browser and navigate to:
    [http://localhost:3000/container](http://localhost:3000/container)

---

## File Structure


.
├── index.js                # Main server file, sets up Express and WebSockets.
├── dockerRoutes.js         # Defines all HTTP API endpoints for Docker actions.
├── dockerConfiguration.js  # (Note: WebSocket logic is in index.js, this file seems redundant/refactored).
├── RunDocker.html          # The main HTML file for the user interface.
├── dockerScript.js         # Frontend JavaScript for UI logic, API calls, and WebSocket handling.
├── dockerStyles.css        # Custom CSS styles for the application.
└── package.json            # Project metadata and dependencies.

