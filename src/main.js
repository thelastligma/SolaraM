const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const Net = require('net');
const Zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { spawn, exec } = require('child_process');
const axios = require('axios');

// Hydrogen Execute API (HTTP-based)
async function executeHydrogen(Code) {
    const HYDRO_START = 6969;
    const HYDRO_END = 7069;
    
    for (let port = HYDRO_START; port <= HYDRO_END; port++) {
        try {
            const response = await axios.get(`http://127.0.0.1:${port}/secret`, { 
                timeout: 1000,
                validateStatus: () => true
            });
            if (response.status === 200 && response.data === '0xdeadbeef') {
                const execResponse = await axios.post(`http://127.0.0.1:${port}/execute`, Code, {
                    headers: { 
                        'Content-Type': 'text/plain',
                        'User-Agent': 'SolaraM/1.0'
                    },
                    timeout: 10000,
                    validateStatus: () => true
                });

                if (execResponse.status === 200) {
                    console.log(`Successfully executed on Hydrogen (port: ${port})`);
                    return `Successfully executed on Hydrogen (port: ${port})`;
                }
            }
        } catch (e) {
            continue;
        }
    }
    
    console.log('Failed to connect to Hydrogen');
    return 'Hydrogen not found';
}

// Opiumware Execute API
async function executeOpiumware(Code, Port) {
    const Ports = ['8392', '8393', '8394', '8395', '8396', '8397'];
    let ConnectedPort = null,
        Stream = null;

    // Auto-prefix with OpiumwareScript if not already prefixed
    let FormattedCode = Code.trim();
    if (!FormattedCode.startsWith('OpiumwareScript') && !FormattedCode.startsWith('OpiumwareSetting')) {
        FormattedCode = 'OpiumwareScript ' + FormattedCode;
    }

    for (const P of (Port === 'ALL' ? Ports : [Port])) {
        try {
            Stream = await new Promise((Resolve, Reject) => {
                const Socket = Net.createConnection({
                    host: '127.0.0.1',
                    port: parseInt(P)
                }, () => Resolve(Socket));
                Socket.on('error', Reject);
                Socket.setTimeout(5000);
            });
            console.log(`Successfully connected to Opiumware on port: ${P}`);
            ConnectedPort = P;
            break;
        } catch (Err) {
            console.log(`Failed to connect to port ${P}: ${Err.message}`);
        }
    }

    if (!Stream) {
        console.log('Failed to connect on all Opiumware ports');
        return 'Failed to connect on all ports';
    }

    if (Code !== 'NULL') {
        try {
            await new Promise((Resolve, Reject) => {
                Zlib.deflate(Buffer.from(FormattedCode, 'utf8'), (Err, Compressed) => {
                    if (Err) return Reject(Err);
                    console.log(`Sending to Opiumware: ${FormattedCode}`);
                    console.log(`Compressed size: ${Compressed.length} bytes`);
                    Stream.write(Compressed, (WriteErr) => {
                        if (WriteErr) return Reject(WriteErr);
                        console.log(`Script sent successfully to Opiumware on port ${ConnectedPort}`);
                        Resolve();
                    });
                });
            });
        } catch (Err) {
            Stream.destroy();
            console.error(`Error sending script: ${Err.message}`);
            return `Error sending script: ${Err.message}`;
        }
    }

    Stream.end();
    return `Successfully executed on Opiumware (port: ${ConnectedPort})`;
}

// MacSploit Port Checking and Management
const MACSPLOIT_START = 5553;
const MACSPLOIT_END = 5563;

async function checkPortStatus() {
    const portStatus = [];
    
    for (let port = MACSPLOIT_START; port <= MACSPLOIT_END; port++) {
        try {
            const client = new Net.Socket();
            const isOnline = await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    client.destroy();
                    resolve(false);
                }, 500);

                client.connect(port, '127.0.0.1', () => {
                    clearTimeout(timeout);
                    client.destroy();
                    resolve(true);
                });

                client.on('error', () => {
                    clearTimeout(timeout);
                    resolve(false);
                });
            });

            portStatus.push({
                port: port,
                type: 'macsploit',
                online: isOnline,
                label: `MacSploit :${port}`
            });
        } catch (e) {
            portStatus.push({
                port: port,
                type: 'macsploit',
                online: false,
                label: `MacSploit :${port}`
            });
        }
    }

    return portStatus;
}

async function executeScriptOnPort(scriptContent, targetPort) {
    if (!targetPort || targetPort === 'auto') {
        return { status: 'error', message: 'Please specify a port' };
    }

    const port = parseInt(targetPort);
    const messages = [];

    try {
        const client = new Net.Socket();
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                client.destroy();
                reject(new Error('Timeout'));
            }, 3000);

            client.connect(port, '127.0.0.1', () => {
                clearTimeout(timeout);
                const header = Buffer.alloc(16);
                header.writeUInt32LE(scriptContent.length + 1, 8);
                const data = Buffer.concat([header, Buffer.from(scriptContent), Buffer.from('\0')]);
                
                client.write(data);
                client.end();
                resolve();
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        return {
            status: 'success',
            message: `Script executed successfully via MacSploit on port ${port}`,
            details: messages
        };
    } catch (e) {
        return {
            status: 'error',
            message: `Error: Failed to execute on port ${port}. Make sure the instance is running.`,
            details: messages
        };
    }
}

// MacSploit Execute API - tries all ports
async function executeMacsploit(Code, Port) {
    const Ports = Port === 'ALL' 
        ? Array.from({length: MACSPLOIT_END - MACSPLOIT_START + 1}, (_, i) => MACSPLOIT_START + i).map(String)
        : [Port];
    
    let successCount = 0;
    let lastError = null;

    for (const P of Ports) {
        try {
            const client = new Net.Socket();
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    client.destroy();
                    reject(new Error('Timeout'));
                }, 3000);

                client.connect(parseInt(P), '127.0.0.1', () => {
                    clearTimeout(timeout);
                    const header = Buffer.alloc(16);
                    header.writeUInt32LE(Code.length + 1, 8);
                    const data = Buffer.concat([header, Buffer.from(Code), Buffer.from('\0')]);
                    
                    console.log(`Sending script to MacSploit on port ${P}`);
                    client.write(data);
                    client.end();
                    resolve();
                });

                client.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });

            successCount++;
            console.log(`Successfully executed on MacSploit (port: ${P})`);
        } catch (Err) {
            lastError = Err;
            console.log(`Failed to connect to MacSploit port ${P}: ${Err.message}`);
        }
    }

    if (successCount > 0) {
        return `Successfully executed on MacSploit (${successCount} port(s))`;
    }

    return lastError ? `Failed to connect to MacSploit: ${lastError.message}` : 'Failed to connect on all MacSploit ports';
}

// Main execute function that routes to the correct executor
async function execute(Code, Port, Executor = 'opiumware') {
    if (Executor === 'hydrogen') {
        return await executeHydrogen(Code);
    } else if (Executor === 'macsploit') {
        return await executeMacsploit(Code, Port);
    } else {
        return await executeOpiumware(Code, Port);
    }
}

function createWindow() {
    const win = new BrowserWindow({
        width: 850, 
        height: 450,
        minWidth: 600,
        minHeight: 400,
        frame: false,
        resizable: true,
        transparent: true,
        backgroundColor: '#030007',
        icon: path.join(__dirname, 'Assets/icons/hulu-icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableWebSQL: false,
            spellcheck: false,
            devTools: true,
            sandbox: false,
            clipboard: true
        }
    });

    win.loadFile('index.html');

    ipcMain.on('min', () => win.minimize());
    ipcMain.on('max', () => {
        if (win.isMaximized()) {
            win.restore();
        } else {
            win.maximize();
        }
        // Force a layout refresh after window animation completes
        setTimeout(() => { 
            win.webContents.send('resize-editor'); 
        }, 250);
    });
    ipcMain.on('close', () => app.quit());
    
    // Execute API IPC handler
    ipcMain.handle('execute', async (event, code, port = 'ALL', executor = 'opiumware') => {
        return await execute(code, port, executor);
    });
    
    // Port Status Check
    ipcMain.handle('check-port-status', async () => {
        return await checkPortStatus();
    });
    
    // Execute on specific MacSploit port
    ipcMain.handle('execute-script-on-port', async (event, scriptContent, targetPort) => {
        return await executeScriptOnPort(scriptContent, targetPort);
    });
}

app.whenReady().then(createWindow);

// macOS: re-create window when dock icon is clicked
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Quit app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});