const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const Net = require('net');
const Zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { spawn, exec } = require('child_process');
const axios = require('axios');
const { EventEmitter } = require('events');

// Persistent MacSploit sockets per port
const macsploitSockets = new Map();

// MacSploit API Constants
const IpcTypes = {
    IPC_EXECUTE: 0,
    IPC_SETTING: 1
};

const MessageTypes = {
    PRINT: 1,
    ERROR: 2
};

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

// MacSploit Execute API (TCP Socket-based)
async function executeMacSploit(Code, Port = 5553) {
    const MACSPLOIT_START = 5553;
    const MACSPLOIT_END = 5562;
    
    // Helper function to build MacSploit IPC header
    function buildHeader(type, length = 0) {
        const data = Buffer.alloc(16 + length + 1);
        data.writeUInt8(type, 0);
        data.writeInt32LE(length, 8);
        return data;
    }
    
    // Helper to execute script on a specific port
    async function executeOnPort(port) {
        return new Promise((resolve, reject) => {
            const socket = Net.createConnection(port, '127.0.0.1');
            let connected = false;
            let hasError = false;
            
            socket.setTimeout(3000);
            
            socket.once('connect', () => {
                connected = true;
                
                // Build and send execute command
                const encoded = Buffer.from(Code, 'utf8');
                const data = buildHeader(IpcTypes.IPC_EXECUTE, encoded.length);
                data.write(Code, 16);
                
                socket.write(data);
                console.log(`MacSploit: Script sent to port ${port}`);
                
                // Close after a short delay to ensure data is sent
                setTimeout(() => {
                    socket.end();
                    if (!hasError) {
                        resolve(`Successfully executed on MacSploit (port: ${port})`);
                    }
                }, 500);
            });
            
            socket.on('data', (data) => {
                // Handle MacSploit responses (PRINT/ERROR messages)
                const type = data.at(0);
                if (type && type in MessageTypes) {
                    const length = data.subarray(8, 16).readBigUInt64LE();
                    const message = data.subarray(16, 16 + Number(length)).toString('utf-8');
                    
                    if (type === MessageTypes.PRINT) {
                        console.log('[MacSploit Print]', message);
                    } else if (type === MessageTypes.ERROR) {
                        console.error('[MacSploit Error]', message);
                    }
                }
            });
            
            socket.on('error', (err) => {
                hasError = true;
                if (!connected) {
                    reject(err);
                } else {
                    console.error(`MacSploit error on port ${port}:`, err.message);
                }
            });
            
            socket.on('timeout', () => {
                hasError = true;
                socket.destroy();
                reject(new Error('Connection timeout'));
            });
        });
    }
    
    // Try specific port if provided, otherwise scan range
    if (Port !== 'ALL') {
        try {
            return await executeOnPort(parseInt(Port));
        } catch (err) {
            console.log(`Failed to connect to MacSploit on port ${Port}: ${err.message}`);
            return `Failed to connect to MacSploit on port ${Port}`;
        }
    }
    
    // Scan all MacSploit ports
    for (let port = MACSPLOIT_START; port <= MACSPLOIT_END; port++) {
        try {
            return await executeOnPort(port);
        } catch (err) {
            console.log(`Port ${port} not available: ${err.message}`);
            continue;
        }
    }
    
    console.log('Failed to connect to MacSploit on any port');
    return 'MacSploit not found';
}

// Main execute function that routes to the correct executor
async function execute(Code, Port, Executor = 'opiumware') {
    if (Executor === 'hydrogen') {
        return await executeHydrogen(Code);
    } else if (Executor === 'macsploit') {
        return await executeMacSploit(Code, Port);
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
    
    // Execute API IPC handler (Hydrogen/Opiumware only)
    ipcMain.handle('execute', async (event, code, port = 'ALL', executor = 'opiumware') => {
        return await execute(code, port, executor);
    });

    // Removed MacSploit IPC; SolaraAPI in renderer handles MacSploit directly
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