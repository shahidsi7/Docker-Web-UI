const launchContainerForm = document.getElementById('launchContainerForm');
const runningContainerListDiv = document.getElementById('runningContainerList');
const stoppedContainerListDiv = document.getElementById('stoppedContainerList');
const loadingRunning = document.getElementById('loadingRunning');
const loadingStopped = document.getElementById('loadingStopped');
const cimageSelect = document.getElementById('cimage');
const customImageDiv = document.getElementById('customImageDiv');
const customImageInput = document.getElementById('customImage');
const localImagesListDiv = document.getElementById('localImagesList');
const loadingImages = document.getElementById('loadingImages');

// Modals
const pullImageModal = document.getElementById('pullImageModal');
const pullImageForm = document.getElementById('pullImageForm');
const pullImageNameInput = document.getElementById('pullImageName');
const pullImageVersionInput = document.getElementById('pullImageVersion');

const confirmationModal = document.getElementById('confirmationModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmActionBtn = document.getElementById('confirmActionBtn');
const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');

const messageContainer = document.getElementById('messageContainer');

// CLI elements
const openCliButton = document.getElementById('openCliButton');
const terminalModal = document.getElementById('terminalModal');
const terminalDiv = document.getElementById('terminal');
const currentContainerNameSpan = document.getElementById('currentContainerName');

// Container Details elements
const containerDetailsModal = document.getElementById('containerDetailsModal');
const detailsContainerNameSpan = document.getElementById('detailsContainerName');
const detailsContentDiv = document.getElementById('detailsContent');
const loadingDetails = document.getElementById('loadingDetails');

// Environment Variables elements
const envVarInputsContainer = document.getElementById('envVarInputsContainer');

// Port Mapping elements
const portMappingInputsContainer = document.getElementById('portMappingInputsContainer');

// Log Streaming elements
const viewLogsButton = document.getElementById('viewLogsButton');
const logModal = document.getElementById('logModal');
const logOutputDiv = document.getElementById('logOutput');
const currentLogContainerNameSpan = document.getElementById('currentLogContainerName');

// Rename Container elements
const renameRunningButton = document.getElementById('renameRunningButton');
const renameStoppedButton = document.getElementById('renameStoppedButton');
const renameContainerModal = document.getElementById('renameContainerModal');
const renameContainerForm = document.getElementById('renameContainerForm');
const oldContainerNameInput = document.getElementById('oldContainerName');
const newContainerNameInput = document.getElementById('newContainerName');

// Container Stats elements
const viewStatsButton = document.getElementById('viewStatsButton');
const containerStatsModal = document.getElementById('containerStatsModal');
const containerStatsContentDiv = document.getElementById('containerStatsContent');
const loadingStats = document.getElementById('loadingStats');


const API_BASE_URL = 'http://localhost:3000';

let confirmCallback = null; // Stores the function to call if user confirms

// Xterm.js variables for CLI and Logs
let cliTerm = null;
let cliFitAddon = null;
let cliWs = null; // WebSocket instance for CLI

let logTerm = null;
let logFitAddon = null;
let logWs = null; // WebSocket instance for Logs

/**
 * Displays a message in a sliding toast notification.
 * @param {string} message - The message content.
 * @param {boolean} isError - True if it's an error message, false for success.
 */
function showMessage(message, isError = false) {
    const messageBox = document.createElement('div');
    messageBox.classList.add('message-box');
    messageBox.classList.add(isError ? 'error' : 'success');
    messageBox.innerHTML = `
        <span>${message}</span>
        <button class="close-btn" onclick="this.parentElement.remove()">×</button>
    `;
    messageContainer.appendChild(messageBox);

    // Automatically remove the message after 5 seconds
    setTimeout(() => {
        if (messageBox.parentElement) { // Check if it hasn't been manually closed
            messageBox.remove();
        }
    }, 5000);
}

/**
 * Shows a custom confirmation modal.
 * @param {string} message - The message to display in the modal.
 * @param {Function} callback - The function to execute if the user confirms.
 */
function showConfirmModal(message, callback) {
    confirmMessage.innerHTML = message;
    confirmationModal.classList.remove('hidden');
    confirmCallback = callback; // Store the callback

    // Set up event listeners for the modal buttons
    confirmActionBtn.onclick = () => {
        confirmationModal.classList.add('hidden');
        if (confirmCallback) {
            confirmCallback(true); // Execute callback with true for confirmation
            confirmCallback = null; // Clear callback
        }
    };
    cancelConfirmBtn.onclick = () => {
        confirmationModal.classList.add('hidden');
        if (confirmCallback) {
            confirmCallback(false); // Execute callback with false for cancellation
            confirmCallback = null; // Clear callback
        }
    };
}

async function fetchAllContainers() {
    loadingRunning.classList.remove('hidden');
    loadingStopped.classList.remove('hidden');
    runningContainerListDiv.innerHTML = '<p class="text-gray-600 text-center py-4">Loading running containers...</p>';
    stoppedContainerListDiv.innerHTML = '<p class="text-gray-600 text-center py-4">Loading stopped containers...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/ps-all`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        // Expect JSON response now
        const allContainers = await response.json();

        const runningContainers = allContainers.filter(c => c.status && c.status.startsWith('Up'));
        const stoppedContainers = allContainers.filter(c => c.status && (c.status.startsWith('Exited') || c.status.startsWith('Created')));

        renderContainers(runningContainers, runningContainerListDiv, 'running');
        renderContainers(stoppedContainers, stoppedContainerListDiv, 'stopped');

    } catch (error) {
        console.error('Error fetching all containers:', error);
        runningContainerListDiv.innerHTML = `<p class="text-red-600 text-center py-4">Failed to load running containers: ${error.message}</p>`;
        stoppedContainerListDiv.innerHTML = `<p class="text-red-600 text-center py-4">Failed to load stopped containers: ${error.message}</p>`;
    } finally {
        loadingRunning.classList.add('hidden');
        loadingStopped.classList.add('hidden');
    }
}

async function fetchLocalImages() {
    loadingImages.classList.remove('hidden');
    localImagesListDiv.innerHTML = '<p class="text-gray-600 text-center py-4">Loading local images...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/images`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        // Expect JSON response now
        const images = await response.json();

        // Populate the image selection dropdown
        populateImageSelect(images);

        if (images.length === 0) {
            localImagesListDiv.innerHTML = '<p class="text-gray-600 text-center py-4">No local Docker images found.</p>';
        } else {
            let tableHtml = `
                <table class="w-full bg-white rounded-lg shadow-md">
                    <thead class="bg-gray-200 sticky top-0 z-10">
                        <tr>
                            <th class="py-2 px-3 text-left text-gray-900 font-bold rounded-tl-lg">
                                <input type="checkbox" id="select-all-images" onclick="toggleAllCheckboxes(this, 'image-checkbox')"> Select All
                            </th>
                            <th class="py-2 px-3 text-left text-gray-900 font-bold">Repository</th>
                            <th class="py-2 px-3 text-left text-gray-900 font-bold rounded-tr-lg">Tag</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            images.forEach(image => {
                const fullImageName = `${image.repository}:${image.tag}`;
                tableHtml += `
                    <tr class="border-b border-gray-200 hover:bg-gray-50">
                        <td class="py-2 px-3">
                            <input type="checkbox" class="image-checkbox" value="${fullImageName}">
                        </td>
                        <td class="py-2 px-3 text-gray-800">${image.repository}</td>
                        <td class="py-2 px-3 text-gray-800">${image.tag}</td>
                    </tr>
                `;
            });
            tableHtml += `</tbody></table>`;
            localImagesListDiv.innerHTML = tableHtml;
        }
    } catch (error) {
        console.error('Error fetching local images:', error);
        localImagesListDiv.innerHTML = `<p class="text-red-600 text-center py-4">Failed to load local images: ${error.message}</p>`;
    } finally {
        loadingImages.classList.add('hidden');
    }
}

function populateImageSelect(images) {
    cimageSelect.innerHTML = ''; // Clear existing options

    // Add local images to the dropdown
    images.forEach(image => {
        // Combine repository and tag for the option value and text
        const fullImageName = `${image.repository}:${image.tag}`;
        const option = document.createElement('option');
        option.value = fullImageName;
        option.textContent = fullImageName;
        cimageSelect.appendChild(option);
    });

    // Ensure customImageDiv is always hidden and not required since 'other' option is removed
    customImageDiv.classList.add('hidden');
    customImageInput.removeAttribute('required');
    customImageInput.value = '';
}

function renderContainers(containers, targetDiv, type) {
    if (containers.length === 0) {
        targetDiv.innerHTML = `<p class="text-gray-600 text-center py-4">No ${type} containers found.</p>`;
        return;
    }

    let tableHtml = `
        <table class="w-full bg-white rounded-lg shadow-md">
            <thead class="bg-gray-200 sticky top-0 z-10">
                <tr>
                    <th class="py-2 px-3 text-left text-gray-900 font-bold rounded-tl-lg">
                        <input type="checkbox" id="select-all-${type}" onclick="toggleAllCheckboxes(this, '${type}-container-checkbox')"> Select All
                    </th>
                    <th class="py-2 px-3 text-left text-gray-900 font-bold">Name</th>
                    <th class="py-2 px-3 text-left text-gray-900 font-bold">Image</th>
                    <th class="py-2 px-3 text-left text-gray-900 font-bold rounded-tr-lg">Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    containers.forEach(container => {
        let displayStatus = container.status;
        // Modify status display only for 'stopped' containers
        if (type === 'stopped') {
            if (displayStatus.includes('Exited (')) {
                // Extract the part after ')' and trim leading/trailing spaces
                const parts = displayStatus.split(')');
                if (parts.length > 1) {
                    displayStatus = parts[1].trim(); 
                }
            } else if (displayStatus.includes('Created ')) {
                // Extract the part after 'Created ' and trim leading/trailing spaces
                const parts = displayStatus.split('Created ');
                if (parts.length > 1) {
                    displayStatus = parts[1].trim();
                }
            }
        }

        tableHtml += `
            <tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="py-2 px-3">
                    <input type="checkbox" class="${type}-container-checkbox" value="${container.name}" onchange="updateCliButtonState()">
                </td>
                <td class="py-2 px-3 text-gray-800">
                    <a href="#" onclick="event.preventDefault(); showContainerDetails('${container.name}')" class="text-blue-600 hover:underline">
                        ${container.name}
                    </a>
                </td>
                <td class="py-2 px-3 text-gray-800">${container.image}</td>
                <td class="py-2 px-3 text-gray-800">${displayStatus}</td>
            </tr>
        `;
    });
    tableHtml += `</tbody></table>`;
    targetDiv.innerHTML = tableHtml;

    // After rendering, update the CLI button state
    updateCliButtonState();
}

function toggleAllCheckboxes(source, checkboxClass) {
    const checkboxes = document.querySelectorAll(`.${checkboxClass}`);
    for (let i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = source.checked;
    }
    updateCliButtonState(); // Update button state after toggling all
}

// This event listener is no longer strictly necessary as 'other' option is removed,
// but keeping it won't cause harm. The customImageDiv is now handled in populateImageSelect.
cimageSelect.addEventListener('change', () => {
    // This block will effectively do nothing unless 'other' option is re-added
    if (cimageSelect.value === 'other') {
        customImageDiv.classList.remove('hidden');
        customImageInput.setAttribute('required', 'required');
    } else {
        customImageDiv.classList.add('hidden');
        customImageInput.removeAttribute('required');
        customImageInput.value = '';
    }
});

// Modified launchContainerForm submission to now collect all data
launchContainerForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevent default form submission
    await launchContainers(); // Call the main launch function
});

/**
 * Adds a new key-value input row for environment variables.
 */
function addEnvVarInput() {
    const row = document.createElement('div');
    row.classList.add('env-var-row');
    row.innerHTML = `
        <input type="text" class="env-var-key" placeholder="VARIABLE_NAME">
        <input type="text" class="env-var-value" placeholder="value">
        <button type="button" onclick="this.parentElement.remove()" class="bg-red-500 hover:bg-red-600 text-white py-1 px-2 rounded-md text-xs">Remove</button>
    `;
    envVarInputsContainer.appendChild(row);
}

/**
 * Adds a new host:container port mapping input row.
 */
function addPortMappingInput() {
    const row = document.createElement('div');
    row.classList.add('port-mapping-row');
    row.innerHTML = `
        <input type="number" class="port-host-port" placeholder="Host Port" min="1" max="65535">
        <span>:</span>
        <input type="number" class="port-container-port" placeholder="Container Port" min="1" max="65535">
        <button type="button" onclick="this.parentElement.remove()" class="bg-red-500 hover:bg-red-600 text-white py-1 px-2 rounded-md text-xs">Remove</button>
    `;
    portMappingInputsContainer.appendChild(row);
}


/**
 * Launches containers with collected environment variables and port mappings.
 */
async function launchContainers() {
    const formData = new FormData(launchContainerForm);
    const cnameBase = formData.get('cname');
    const numContainers = parseInt(formData.get('numContainers'), 10);
    const containerImage = cimageSelect.value;

    if (!cnameBase || !containerImage || isNaN(numContainers) || numContainers < 1) {
        showMessage("Please fill in all required fields (Container Name Base, Image, Number of Containers).", true);
        return;
    }

    // Collect Environment Variables
    const envVars = [];
    const envVarRows = envVarInputsContainer.querySelectorAll('.env-var-row');
    for (const row of envVarRows) {
        const keyInput = row.querySelector('.env-var-key');
        const valueInput = row.querySelector('.env-var-value');
        const key = keyInput.value.trim();
        const value = valueInput.value.trim();
        if (key !== '') {
            envVars.push({ key, value });
        }
    }

    // Collect Port Mappings
    const portMappings = [];
    const portMappingRows = portMappingInputsContainer.querySelectorAll('.port-mapping-row');
    for (const row of portMappingRows) {
        const hostPortInput = row.querySelector('.port-host-port');
        const containerPortInput = row.querySelector('.port-container-port');
        const hostPort = hostPortInput.value.trim();
        const containerPort = containerPortInput.value.trim();
        if (hostPort !== '' && containerPort !== '') {
            portMappings.push({ hostPort, containerPort });
        }
    }

    // Construct the payload for the POST request
    const payload = {
        cname: cnameBase,
        cimage: containerImage,
        numContainers: numContainers,
        envVars: envVars,
        portMappings: portMappings,
    };

    try {
        const response = await fetch(`${API_BASE_URL}/run`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json(); // Expect JSON response from backend

        if (!response.ok) {
            showMessage(`Launch failed: ${result.message || result.error || 'Unknown error'}<br>${result.details ? result.details.join('<br>') : ''}`, true);
        } else {
            showMessage(result.message, false);
        }
    } catch (error) {
        console.error('Error launching containers:', error);
        showMessage(`Network error launching containers: ${error.message}`, true);
    } finally {
        // Clear inputs after launch attempt
        launchContainerForm.reset();
        envVarInputsContainer.innerHTML = '';
        portMappingInputsContainer.innerHTML = '';
        fetchAllContainers();
        fetchLocalImages();
    }
}

// Function to show the pull image modal
function showPullImageModal() {
    pullImageModal.classList.remove('hidden');
    pullImageNameInput.focus(); // Focus on the first input field
}

// Function to hide the pull image modal
function hidePullImageModal() {
    pullImageModal.classList.add('hidden');
    pullImageForm.reset(); // Clear form fields
}

// Event listener for the pull image form submission
pullImageForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const imageName = pullImageNameInput.value.trim();
    let imageVersion = pullImageVersionInput.value.trim();

    if (!imageName) {
        showMessage("Image name cannot be empty.", true);
        return;
    }

    const fullImageName = imageVersion ? `${imageName}:${imageVersion}` : `${imageName}:latest`;

    hidePullImageModal(); // Hide modal immediately

    try {
        const response = await fetch(`${API_BASE_URL}/pull?imagename=${encodeURIComponent(fullImageName)}`);
        const resultText = await response.text();

        if (!response.ok) {
            showMessage(`Error pulling image: ${resultText}`, true);
        } else {
            showMessage(resultText, false);
            fetchLocalImages(); // Refresh image list after successful pull
        }
    } catch (error) {
            console.error('Error pulling image:', error);
            showMessage(`Network error pulling image: ${error.message}`, true);
    }
});

// New function to handle removing selected images
async function removeSelectedImagesFromList() {
    const checkboxes = document.querySelectorAll(`.image-checkbox:checked`);
    const selectedImageNames = Array.from(checkboxes).map(cb => cb.value);

    if (selectedImageNames.length === 0) {
        showMessage("Please select at least one image to remove.", true);
        return;
    }

    showConfirmModal(`Are you sure you want to remove ${selectedImageNames.length} selected image(s)? This action cannot be undone.`, async (confirmed) => {
        if (!confirmed) {
            showMessage("Image removal cancelled.", false);
            return;
        }

        let successCount = 0;
        let failureCount = 0;
        let results = [];

        for (const name of selectedImageNames) {
            try {
                const response = await fetch(`${API_BASE_URL}/rmi?imagename=${encodeURIComponent(name)}`);
                const resultText = await response.text();

                if (!response.ok) {
                    results.push(`Failed to remove '${name}': ${resultText}`);
                    failureCount++;
                } else {
                    results.push(`Successfully removed '${name}'.`);
                    successCount++;
                }
            }
            catch (error) {
                results.push(`Network error for '${name}': ${error.message}`);
                failureCount++;
            }
        }

        if (failureCount > 0) {
            showMessage(`Image removal completed with ${successCount} successes and ${failureCount} failures:<br>${results.join('<br>')}`, true);
        } else {
            showMessage(`Successfully removed ${successCount} image(s).`, false);
        }

        fetchLocalImages(); // Refresh the image list after removal attempts
        fetchAllContainers(); // Also refresh containers, as removing an image might affect them
    });
}


async function performActionOnSelected(actionType, checkboxClass, confirmationMessage) {
    const checkboxes = document.querySelectorAll(`.${checkboxClass}:checked`);
    const selectedContainerNames = Array.from(checkboxes).map(cb => cb.value);

    if (selectedContainerNames.length === 0) {
        showMessage("Please select at least one container.", true);
        return;
    }

    showConfirmModal(`${confirmationMessage} ${selectedContainerNames.length} container(s)?`, async (confirmed) => {
        if (!confirmed) {
            showMessage("Action cancelled.", false);
            return;
        }

        let successCount = 0;
        let failureCount = 0;
        let results = [];

        for (const name of selectedContainerNames) {
            try {
                const response = await fetch(`${API_BASE_URL}/${actionType}?cname=${encodeURIComponent(name)}`);
                const resultText = await response.text();

                if (!response.ok) {
                    results.push(`Failed to ${actionType} '${name}': ${resultText}`);
                    failureCount++;
                } else {
                    results.push(`Successfully ${actionType} '${name}'.`);
                    successCount++;
                }
            } catch (error) {
                results.push(`Network error for '${name}': ${error.message}`);
                failureCount++;
            }
        }

        if (failureCount > 0) {
            showMessage(`Action completed with ${successCount} successes and ${failureCount} failures:<br>${results.join('<br>')}`, true);
        } else {
            showMessage(`Action completed successfully for ${successCount} container(s).`, false);
        }

        fetchAllContainers();
        fetchLocalImages();
    });
}

function stopSelectedContainers() {
    performActionOnSelected('stop', 'running-container-checkbox', 'Are you sure you want to stop');
}

function startSelectedContainers() {
    performActionOnSelected('start', 'stopped-container-checkbox', 'Are you sure you want to start');
}

function removeSelectedContainers(type) {
    const checkboxClass = `${type}-container-checkbox`;
    performActionOnSelected('rm', checkboxClass, 'Are you sure you want to remove');
}

/**
 * Updates the disabled state of the 'Open CLI', 'View Logs', 'Rename', and 'View Stats' buttons.
 */
function updateCliButtonState() {
    const runningCheckboxes = document.querySelectorAll('.running-container-checkbox:checked');
    const stoppedCheckboxes = document.querySelectorAll('.stopped-container-checkbox:checked');

    // CLI and Logs buttons: enabled only if exactly one running container is selected
    const enableCliLogs = runningCheckboxes.length === 1;
    openCliButton.disabled = !enableCliLogs;
    viewLogsButton.disabled = !enableCliLogs;

    // Rename buttons: enabled only if exactly one container (running or stopped) is selected
    const enableRenameRunning = runningCheckboxes.length === 1;
    const enableRenameStopped = stoppedCheckboxes.length === 1;
    renameRunningButton.disabled = !enableRenameRunning;
    renameStoppedButton.disabled = !enableRenameStopped;

    // View Stats button: enabled if one or more running containers are selected
    const enableViewStats = runningCheckboxes.length > 0;
    viewStatsButton.disabled = !enableViewStats;
}

/**
 * Opens the terminal modal and establishes WebSocket connection for CLI access.
 */
function openContainerCli() {
    const selectedRunningCheckboxes = document.querySelectorAll('.running-container-checkbox:checked');

    if (selectedRunningCheckboxes.length !== 1) {
        showMessage("Please select exactly one running container to open CLI.", true);
        return;
    }

    const containerName = selectedRunningCheckboxes[0].value;
    currentContainerNameSpan.textContent = containerName; // Set container name in modal title
    terminalModal.classList.remove('hidden');

    // Initialize xterm.js if not already
    if (!cliTerm) {
        cliTerm = new Terminal({
            cursorBlink: true,
            macOptionIsMeta: true,
            scrollback: 1000, // Keep a decent scrollback buffer
            theme: {
                background: '#000000',
                foreground: '#FFFFFF',
                cursor: '#FFFFFF',
                selectionBackground: '#555555',
                black: '#000000',
                red: '#FF0000',
                green: '#00FF00',
                yellow: '#FFFF00',
                blue: '#0000FF',
                magenta: '#FF00FF',
                cyan: '#00FFFF',
                white: '#FFFFFF',
                brightBlack: '#808080',
                brightRed: '#FF0000',
                brightGreen: '#00FF00',
                brightYellow: '#FFFF00',
                brightBlue: '#0000FF',
                brightMagenta: '#FF00FF',
                brightCyan: '#00FFFF',
                brightWhite: '#FFFFFF'
            }
        });
        cliFitAddon = new FitAddon.FitAddon();
        cliTerm.loadAddon(cliFitAddon);
        cliTerm.open(terminalDiv);
    } else {
        // Clear existing terminal content if reusing
        cliTerm.reset();
    }

    // Establish WebSocket connection
    cliWs = new WebSocket(`${API_BASE_URL.replace('http', 'ws')}/ws/container-cli?cname=${encodeURIComponent(containerName)}&type=cli`);

    cliWs.onopen = () => {
        console.log('CLI WebSocket connected.');
        cliFitAddon.fit(); // Fit terminal to current size
        cliTerm.focus(); // Focus terminal for input
        // Send initial resize data to backend
        cliWs.send(JSON.stringify({ type: 'resize', cols: cliTerm.cols, rows: cliTerm.rows }));
    };

    cliWs.onmessage = event => {
        // Write data from WebSocket to terminal
        cliTerm.write(event.data);
    };

    cliWs.onclose = () => {
        console.log('CLI WebSocket disconnected.');
        showMessage(`CLI session for '${containerName}' ended.`, false);
        // No need to dispose term here, it will be done when modal is closed
    };

    cliWs.onerror = error => {
        console.error('CLI WebSocket error:', error);
        showMessage(`CLI connection error for '${containerName}': ${error.message}`, true);
        if (cliTerm) cliTerm.write('\r\n\x1b[31mError: Connection lost or failed.\x1b[0m\r\n');
        closeTerminalModal(); // Close modal on error
    };

    // Send input from xterm.js to WebSocket
    cliTerm.onData(data => {
        if (cliWs && cliWs.readyState === WebSocket.OPEN) {
            cliWs.send(JSON.stringify({ type: 'input', data: data }));
        }
    });

    // Send resize events from xterm.js to WebSocket
    cliTerm.onResize(size => {
        if (cliWs && cliWs.readyState === WebSocket.OPEN) {
            cliWs.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
        }
    });

    // Handle window resize to refit the terminal
    window.addEventListener('resize', handleTerminalResize);
}

/**
 * Handles window resize event to refit the xterm.js terminal.
 */
function handleTerminalResize() {
    if (cliTerm && cliFitAddon && terminalModal.classList.contains('hidden') === false) {
        cliFitAddon.fit();
    }
    if (logTerm && logFitAddon && logModal.classList.contains('hidden') === false) {
        logFitAddon.fit();
    }
}

/**
 * Closes the terminal modal and cleans up WebSocket/xterm.js resources.
 */
function closeTerminalModal() {
    terminalModal.classList.add('hidden');
    if (cliWs) {
        cliWs.close();
        cliWs = null;
    }
    // Dispose xterm.js instance to free up resources
    if (cliTerm) {
        cliTerm.dispose();
        cliTerm = null;
        cliFitAddon = null;
    }
    window.removeEventListener('resize', handleTerminalResize); // Remove resize listener
}

/**
 * Opens the container details modal and fetches data.
 * @param {string} containerName - The name of the container to show details for.
 */
async function showContainerDetails(containerName) {
    detailsContainerNameSpan.textContent = containerName;
    detailsContentDiv.innerHTML = ''; // Clear previous content
    loadingDetails.classList.remove('hidden'); // Show loading message
    containerDetailsModal.classList.remove('hidden'); // Show the modal

    try {
        const response = await fetch(`${API_BASE_URL}/container-details?cname=${encodeURIComponent(containerName)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch container details.');
        }

        loadingDetails.classList.add('hidden'); // Hide loading message
        renderContainerDetails(data);

    } catch (error) {
        console.error('Error fetching container details:', error);
        loadingDetails.classList.add('hidden'); // Hide loading message
        detailsContentDiv.innerHTML = `<p class="text-red-600">Error: ${error.message}</p>`;
        showMessage(`Failed to load details for '${containerName}': ${error.message}`, true);
    }
}

/**
 * Renders the fetched container details into the modal.
 * @param {object} details - The container details object from docker inspect.
 */
function renderContainerDetails(details) {
    let html = '';

    const addDetail = (label, value, isCode = false) => {
        if (value === null || value === undefined || value === '') return;
        html += `
            <div class="detail-item">
                <span class="detail-label">${label}:</span>
                <div class="detail-value ${isCode ? '' : 'normal-text'}">${value}</div>
            </div>
        `;
    };

    // Basic Info
    addDetail('ID', details.Id ? details.Id.substring(0, 12) : 'N/A', true);
    addDetail('Name', details.Name ? details.Name.replace(/^\//, '') : 'N/A');
    addDetail('Image', details.Config.Image || 'N/A');
    addDetail('Status', details.State.Status || 'N/A');
    addDetail('Created', new Date(details.Created).toLocaleString() || 'N/A');
    addDetail('Started At', details.State.StartedAt && details.State.StartedAt !== '0001-01-01T00:00:00Z' ? new Date(details.State.StartedAt).toLocaleString() : 'N/A');
    addDetail('Finished At', details.State.FinishedAt && details.State.FinishedAt !== '0001-01-01T00:00:00Z' ? new Date(details.State.FinishedAt).toLocaleString() : 'N/A');
    addDetail('Exit Code', details.State.ExitCode !== undefined ? details.State.ExitCode : 'N/A');

    // Port Bindings
    if (details.HostConfig && details.HostConfig.PortBindings && Object.keys(details.HostConfig.PortBindings).length > 0) {
        html += '<h4 class="text-lg font-semibold text-gray-800 mt-4 mb-2">Port Bindings</h4>';
        let portBindingsHtml = '';
        for (const containerPort in details.HostConfig.PortBindings) {
            const bindings = details.HostConfig.PortBindings[containerPort];
            bindings.forEach(binding => {
                portBindingsHtml += `${containerPort} -> ${binding.HostIp || '0.0.0.0'}:${binding.HostPort}<br>`;
            });
        }
        addDetail('Mappings', portBindingsHtml, true);
    }

    // Mounts (Volumes)
    if (details.Mounts && details.Mounts.length > 0) {
        html += '<h4 class="text-lg font-semibold text-gray-800 mt-4 mb-2">Mounts (Volumes)</h4>';
        details.Mounts.forEach(mount => {
            addDetail(`Source: ${mount.Source}`, `Destination: ${mount.Destination}<br>Type: ${mount.Type}<br>RW: ${mount.RW}`, true);
        });
    }

    // Command and Entrypoint
    if (details.Config && (details.Config.Cmd || details.Config.Entrypoint)) {
        html += '<h4 class="text-lg font-semibold text-gray-800 mt-4 mb-2">Command & Entrypoint</h4>';
        if (details.Config.Entrypoint && details.Config.Entrypoint.length > 0) {
            addDetail('Entrypoint', details.Config.Entrypoint.join(' '), true);
        }
        if (details.Config.Cmd && details.Config.Cmd.length > 0) {
            addDetail('Command', details.Config.Cmd.join(' '), true);
        }
    }

    // Environment Variables from Config
    if (details.Config && details.Config.Env && details.Config.Env.length > 0) {
        html += '<h4 class="text-lg font-semibold text-gray-800 mt-4 mb-2">Environment Variables</h4>';
        let envVarsHtml = '';
        details.Config.Env.forEach(env => {
            envVarsHtml += `${env}<br>`; // Env vars are typically in KEY=VALUE format
        });
        addDetail('Variables', envVarsHtml, true);
    }


    detailsContentDiv.innerHTML = html;
}

/**
 * Closes the container details modal.
 */
function closeContainerDetailsModal() {
    containerDetailsModal.classList.add('hidden');
    detailsContentDiv.innerHTML = ''; // Clear content when closing
}

/**
 * Opens the log streaming modal and establishes WebSocket connection for logs.
 */
function openContainerLogs() {
    const selectedRunningCheckboxes = document.querySelectorAll('.running-container-checkbox:checked');

    if (selectedRunningCheckboxes.length !== 1) {
        showMessage("Please select exactly one running container to view logs.", true);
        return;
    }

    const containerName = selectedRunningCheckboxes[0].value;
    currentLogContainerNameSpan.textContent = containerName; // Set container name in modal title
    logModal.classList.remove('hidden');

    // Initialize xterm.js for logs if not already
    if (!logTerm) {
        logTerm = new Terminal({
            scrollback: 1000,
            theme: {
                background: '#000000',
                foreground: '#FFFFFF',
                black: '#000000',
                red: '#FF0000',
                green: '#00FF00',
                yellow: '#FFFF00',
                blue: '#0000FF',
                magenta: '#FF00FF',
                cyan: '#00FFFF',
                white: '#FFFFFF',
                brightBlack: '#808080',
                brightRed: '#FF0000',
                brightGreen: '#00FF00',
                brightYellow: '#FFFF00',
                brightBlue: '#0000FF',
                brightMagenta: '#FF00FF',
                brightCyan: '#00FFFF',
                brightWhite: '#FFFFFF'
            }
        });
        logFitAddon = new FitAddon.FitAddon();
        logTerm.loadAddon(logFitAddon);
        logTerm.open(logOutputDiv);
    } else {
        logTerm.reset(); // Clear existing terminal content if reusing
    }

    // Establish WebSocket connection
    logWs = new WebSocket(`${API_BASE_URL.replace('http', 'ws')}/ws/container-logs?cname=${encodeURIComponent(containerName)}&type=logs`);

    logWs.onopen = () => {
        console.log('Log WebSocket connected.');
        logFitAddon.fit(); // Fit terminal to current size
        logTerm.focus(); // Focus terminal for input (though logs are usually output only)
    };

    logWs.onmessage = event => {
        logTerm.write(event.data); // Write log data to xterm.js
    };

    logWs.onclose = () => {
        console.log('Log WebSocket disconnected.');
        showMessage(`Log stream for '${containerName}' ended.`, false);
    };

    logWs.onerror = error => {
        console.error('Log WebSocket error:', error);
        showMessage(`Log connection error for '${containerName}': ${error.message}`, true);
        if (logTerm) logTerm.write('\r\n\x1b[31mError: Connection lost or failed.\x1b[0m\r\n');
        closeContainerLogsModal(); // Close modal on error
    };

    // Handle window resize to refit the log terminal
    window.addEventListener('resize', handleTerminalResize);
}

/**
 * Closes the log streaming modal and cleans up WebSocket/xterm.js resources.
 */
function closeContainerLogsModal() {
    logModal.classList.add('hidden');
    if (logWs) {
        logWs.close();
        logWs = null;
    }
    if (logTerm) {
        logTerm.dispose();
        logTerm = null;
        logFitAddon = null;
    }
    window.removeEventListener('resize', handleTerminalResize); // Remove resize listener
}

/**
 * Shows the rename container modal.
 * @param {string} type - 'running' or 'stopped' to determine which list to check.
 */
function showRenameContainerModal(type) {
    let selectedContainerName = null;
    if (type === 'running') {
        const selectedRunningCheckboxes = document.querySelectorAll('.running-container-checkbox:checked');
        if (selectedRunningCheckboxes.length === 1) {
            selectedContainerName = selectedRunningCheckboxes[0].value;
        }
    } else if (type === 'stopped') {
        const selectedStoppedCheckboxes = document.querySelectorAll('.stopped-container-checkbox:checked');
        if (selectedStoppedCheckboxes.length === 1) {
            selectedContainerName = selectedStoppedCheckboxes[0].value;
        }
    }

    if (!selectedContainerName) {
        showMessage("Please select exactly one container to rename.", true);
        return;
    }

    oldContainerNameInput.value = selectedContainerName;
    newContainerNameInput.value = ''; // Clear previous new name
    renameContainerModal.classList.remove('hidden');
    newContainerNameInput.focus();
}

/**
 * Closes the rename container modal.
 */
function closeRenameContainerModal() {
    renameContainerModal.classList.add('hidden');
    renameContainerForm.reset();
}

/**
 * Handles the submission of the rename container form.
 */
renameContainerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const oldName = oldContainerNameInput.value.trim();
    const newName = newContainerNameInput.value.trim();

    if (!oldName || !newName) {
        showMessage("Both current and new container names are required.", true);
        return;
    }

    if (oldName === newName) {
        showMessage("The new container name cannot be the same as the old name.", true);
        return;
    }

    closeRenameContainerModal(); // Close modal immediately

    try {
        const response = await fetch(`${API_BASE_URL}/rename-container`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ oldName, newName })
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to rename container.');
        }

        showMessage(result.message, false);
        fetchAllContainers(); // Refresh container list after successful rename

    } catch (error) {
        console.error('Error renaming container:', error);
        showMessage(`Failed to rename container: ${error.message}`, true);
    }
});

/**
 * Shows the container stats modal and fetches stats for selected running containers.
 */
async function showContainerStatsModal() {
    const selectedRunningCheckboxes = document.querySelectorAll('.running-container-checkbox:checked');
    const selectedContainerNames = Array.from(selectedRunningCheckboxes).map(cb => cb.value);

    if (selectedContainerNames.length === 0) {
        showMessage("Please select at least one running container to view stats.", true);
        return;
    }

    containerStatsContentDiv.innerHTML = ''; // Clear previous content
    loadingStats.classList.remove('hidden'); // Show loading message
    containerStatsModal.classList.remove('hidden'); // Show the modal

    try {
        const response = await fetch(`${API_BASE_URL}/container-stats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ containerNames: selectedContainerNames })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch container stats.');
        }

        loadingStats.classList.add('hidden'); // Hide loading message
        renderContainerStats(data);

    } catch (error) {
        console.error('Error fetching container stats:', error);
        loadingStats.classList.add('hidden'); // Hide loading message
        containerStatsContentDiv.innerHTML = `<p class="text-red-600">Error: ${error.message}</p>`;
        showMessage(`Failed to load stats: ${error.message}`, true);
    }
}

/**
 * Renders the fetched container stats into the modal.
 * @param {Array<Object>} stats - An array of container stats objects.
 */
function renderContainerStats(stats) {
    if (stats.length === 0) {
        containerStatsContentDiv.innerHTML = '<p class="text-gray-600 text-center py-4">No stats available for selected containers (they might have stopped).</p>';
        return;
    }

    let tableHtml = `
        <table id="containerStatsTable">
            <thead>
                <tr>
                    <th>Container ID</th>
                    <th>Name</th>
                    <th>CPU %</th>
                    <th>Mem Usage</th>
                    <th>Mem %</th>
                    <th>Net I/O</th>
                    <th>Block I/O</th>
                    <th>PIDs</th>
                </tr>
            </thead>
            <tbody>
    `;

    stats.forEach(stat => {
        tableHtml += `
            <tr>
                <td>${stat.CONTAINER_ID || 'N/A'}</td>
                <td>${stat.NAME || 'N/A'}</td>
                <td>${stat.CPU_PERCENT || 'N/A'}</td>
                <td>${stat.MEM_USAGE || 'N/A'}</td>
                <td>${stat.MEM_PERCENT || 'N/A'}</td>
                <td>${stat.NET_IO || 'N/A'}</td>
                <td>${stat.BLOCK_IO || 'N/A'}</td>
                <td>${stat.PIDS || 'N/A'}</td>
            </tr>
        `;
    });

    tableHtml += `</tbody></table>`;
    containerStatsContentDiv.innerHTML = tableHtml;
}

/**
 * Closes the container stats modal.
 */
function closeContainerStatsModal() {
    containerStatsModal.classList.add('hidden');
    containerStatsContentDiv.innerHTML = ''; // Clear content when closing
}


document.addEventListener('DOMContentLoaded', () => {
    fetchAllContainers();
    fetchLocalImages();
    // Initial state update for CLI and Logs buttons
    updateCliButtonState();

    // Add event listeners for checkboxes to update button state
    document.getElementById('runningContainerList').addEventListener('change', (event) => {
        if (event.target.classList.contains('running-container-checkbox')) {
            updateCliButtonState();
        }
    });
    // Also listen to the "select all" checkbox for running containers
    document.getElementById('runningContainerList').addEventListener('change', (event) => {
        if (event.target.id === 'select-all-running') {
            updateCliButtonState();
        }
    });

    // Add event listeners for stopped container checkboxes to update button state
    document.getElementById('stoppedContainerList').addEventListener('change', (event) => {
        if (event.target.classList.contains('stopped-container-checkbox')) {
            updateCliButtonState();
        }
    });
    // Also listen to the "select all" checkbox for stopped containers
    document.getElementById('stoppedContainerList').addEventListener('change', (event) => {
        if (event.target.id === 'select-all-stopped') {
            updateCliButtonState();
        }
    });
});
