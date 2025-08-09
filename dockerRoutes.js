const express = require('express');
const { exec, spawn } = require('child_process');
const router = express.Router();

// Serve Docker UI
router.get("/container", function(request, response) {
    response.sendFile(__dirname + "/RunDocker.html");
});

// Changed to POST to handle environment variables and port mappings in the request body
router.post("/run", (request, response) => {
    const { cname, cimage, numContainers, envVars, portMappings } = request.body; 

    if (!cname || !cimage || numContainers === undefined) {
        return response.status(400).send("Error: Container name, image, and number of containers are required.");
    }

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    // Use a loop to launch multiple containers
    const launchPromises = [];
    for (let i = 1; i <= numContainers; i++) {
        const containerName = `${cname}-${i}`;
        
        // Build the arguments array for docker run
        const args = ['run', '-dit', '--name', containerName];

        // Add environment variable flags
        if (envVars && Array.isArray(envVars)) {
            envVars.forEach(env => {
                if (env.key && env.value) {
                    args.push('-e', `${env.key}=${env.value}`);
                }
            });
        }

        // Add port mapping flags
        if (portMappings && Array.isArray(portMappings)) {
            portMappings.forEach(pm => {
                if (pm.hostPort && pm.containerPort) {
                    args.push('-p', `${pm.hostPort}:${pm.containerPort}`);
                }
            });
        }

        // Add the image name as the last argument
        args.push(cimage);

        launchPromises.push(new Promise((resolve) => {
            // Use spawn for docker run command to avoid shell parsing issues
            const childProcess = spawn('docker', args);

            let stdout = '';
            let stderr = '';

            childProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            childProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            childProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error(`spawn error for 'docker run ${containerName}': ${stderr}`);
                    results.push(`Failed to launch '${containerName}': ${stderr}`);
                    failureCount++;
                } else {
                    results.push(`Successfully launched '${containerName}': ${stdout}`);
                    successCount++;
                }
                resolve();
            });

            childProcess.on('error', (err) => {
                console.error(`spawn error for 'docker run ${containerName}': ${err.message}`);
                results.push(`Failed to launch '${containerName}': ${err.message}`);
                failureCount++;
                resolve();
            });
        }));
    }

    Promise.all(launchPromises)
        .then(() => {
            if (failureCount > 0) {
                response.status(500).json({
                    message: `Launch completed with ${successCount} successes and ${failureCount} failures.`,
                    details: results,
                    success: false
                });
            } else {
                response.status(200).json({
                    message: `Successfully launched ${successCount} container(s).`,
                    details: results,
                    success: true
                });
            }
        })
        .catch(error => {
            console.error('Error during container launch promises:', error);
            response.status(500).json({ error: "An unexpected error occurred during container launches.", details: error.message });
        });
});

router.get("/ps-all", (request, response) => {
    exec("docker ps -a", (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error for 'docker ps -a': ${err}`);
            return response.status(500).send(`<pre>Error listing all containers: ${stderr}</pre>`);
        }

        const lines = stdout.trim().split('\n');
        const containers = [];

        // Start from index 1 to skip the header line
        if (lines.length > 1) {
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                // Split by multiple spaces to handle varied output spacing
                const columns = line.trim().split(/\s{2,}/);

                // Ensure we have enough columns to parse
                if (columns.length >= 6) {
                    const image = columns[1].trim();
                    const status = columns[4].trim();
                    const name = columns[columns.length - 1].trim();
                    containers.push({ name, image, status });
                }
            }
        }
        // Always send a JSON array, even if empty
        response.json(containers);
    });
});

router.get("/images", (request, response) => {
    exec("docker images", (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error for 'docker images': ${err}`);
            return response.status(500).send(`<pre>Error listing images: ${stderr}</pre>`);
        }

        const lines = stdout.trim().split('\n');
        const images = [];

        // Start from index 1 to skip the header line
        if (lines.length > 1) {
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                // Split by one or more spaces
                const columns = line.trim().split(/\s+/);

                if (columns.length >= 2) {
                    const repository = columns[0].trim();
                    const tag = columns[1].trim();
                    images.push({ repository, tag });
                }
            }
        }
        // Always send a JSON array, even if empty
        response.json(images);
    });
});

router.get("/pull", (request, response) => {
    const image_name = request.query.imagename;

    if (!image_name) {
        return response.status(400).send("Error: Image name is required to pull.");
    }

    exec(`docker pull ${image_name}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error for 'docker pull': ${err}`);
            return response.status(500).send(`<pre>Error pulling image: ${stderr}</pre>`);
        }
        response.send(`<pre>Image '${image_name}' pulled successfully: ${stdout}</pre>`);
        console.log(`stdout for 'docker pull': ${stdout}`);
    });
});

router.get("/rmi", (request, response) => {
    const image_name = request.query.imagename;

    if (!image_name) {
        return response.status(400).send("Error: Image name is required to remove.");
    }

    // Use -f (force) to remove images even if tagged or used by stopped containers
    exec(`docker rmi -f ${image_name}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error for 'docker rmi': ${err}`);
            return response.status(500).send(`<pre>Error removing image: ${stderr}</pre>`);
        }
        response.send(`<pre>Image '${image_name}' removed successfully: ${stdout}</pre>`);
        console.log(`stdout for 'docker rmi': ${stdout}`);
    });
});


router.get("/stop", (request, response) => {
    const container_name = request.query.cname;

    if (!container_name) {
        return response.status(400).send("Error: Container name is required to stop.");
    }

    exec(`docker stop ${container_name}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error for 'docker stop': ${err}`);
            return response.status(500).send(`<pre>Error stopping container: ${stderr}</pre>`);
        }
        response.send(`<pre>Container '${container_name}' stopped successfully: ${stdout}</pre>`);
        console.log(`stdout for 'docker stop': ${stdout}`);
    });
});

router.get("/start", (request, response) => {
    const container_name = request.query.cname;

    if (!container_name) {
        return response.status(400).send("Error: Container name is required to start.");
    }

    exec(`docker start ${container_name}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error for 'docker start': ${err}`);
            return response.status(500).send(`<pre>Error starting container: ${stderr}</pre>`);
        }
        response.send(`<pre>Container '${container_name}' started successfully: ${stdout}</pre>`);
        console.log(`stdout for 'docker start': ${stdout}`);
    });
});

router.get("/rm", (request, response) => {
    const container_name = request.query.cname;

    if (!container_name) {
        return response.status(400).send("Error: Container name is required to remove.");
    }

    exec(`docker rm -f ${container_name}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error for 'docker rm -f': ${err}`);
            return response.status(500).send(`<pre>Error removing container: ${stderr}</pre>`);
        }
        response.send(`<pre>Container '${container_name}' removed successfully: ${stdout}</pre>`);
        console.log(`stdout for 'docker rm -f': ${stdout}`);
    });
});

// New endpoint to get detailed information about a single container
router.get("/container-details", (request, response) => {
    const container_name = request.query.cname;

    if (!container_name) {
        return response.status(400).json({ error: "Container name is required to get details." });
    }

    exec(`docker inspect ${container_name}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error for 'docker inspect ${container_name}': ${err}`);
            // Check if error indicates container not found
            if (stderr.includes("No such object")) {
                return response.status(404).json({ error: `Container '${container_name}' not found.`, details: stderr });
            }
            return response.status(500).json({ error: `Error inspecting container: ${stderr}`, details: stderr });
        }

        try {
            const details = JSON.parse(stdout);
            if (details.length > 0) {
                // Docker inspect returns an array, take the first element
                response.json(details[0]);
            } else {
                response.status(404).json({ error: `No details found for container '${container_name}'.` });
            }
        }
        catch (parseError) {
            console.error(`Error parsing docker inspect output for ${container_name}:`, parseError);
            response.status(500).json({ error: "Failed to parse container details.", details: parseError.message });
        }
    });
});

// New endpoint to rename a container
router.post("/rename-container", (request, response) => {
    const { oldName, newName } = request.body;

    if (!oldName || !newName) {
        return response.status(400).json({ error: "Both old and new container names are required for renaming." });
    }

    exec(`docker rename ${oldName} ${newName}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error for 'docker rename ${oldName} ${newName}': ${err}`);
            return response.status(500).json({ error: `Error renaming container: ${stderr}`, details: stderr });
        }
        response.status(200).json({ message: `Container '${oldName}' successfully renamed to '${newName}'.`, stdout: stdout });
    });
});

// New endpoint to get container stats
router.post("/container-stats", (request, response) => {
    const { containerNames } = request.body;

    if (!containerNames || !Array.isArray(containerNames) || containerNames.length === 0) {
        return response.status(400).json({ error: "An array of container names is required to get stats." });
    }

    // Use --no-stream to get a single snapshot, --format to get JSON output
    // NOTE: docker stats --format '{{json .}}' is available in newer Docker versions.
    // For broader compatibility, we'll parse the standard table output.
    const command = `docker stats --no-stream ${containerNames.join(' ')}`;

    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error for 'docker stats': ${err}`);
            return response.status(500).json({ error: `Error fetching container stats: ${stderr}`, details: stderr });
        }

        const lines = stdout.trim().split('\n');
        if (lines.length <= 1) { // Only header or no output
            return response.status(200).json([]);
        }

        const headers = lines[0].trim().split(/\s{2,}/).map(h => h.replace(/%$/, 'PERCENT').replace(/\//g, '_PER_').replace(/\s/g, '_').toUpperCase());
        const stats = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            const columns = line.split(/\s{2,}/); // Split by 2 or more spaces

            const containerStat = {};
            // Map columns to headers. This is a bit fragile if docker stats output changes.
            // A more robust solution would be to use --format '{{json .}}' if Docker version permits.
            if (columns.length === headers.length) {
                headers.forEach((header, index) => {
                    containerStat[header] = columns[index];
                });
                stats.push(containerStat);
            } else {
                console.warn(`Skipping malformed docker stats line: ${line}`);
            }
        }
        response.status(200).json(stats);
    });
});

module.exports = router;
