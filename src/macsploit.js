// MacSploit API JS V1.1
// Compatible with both Node.js and Electron

let EventEmitter, net;

// Check if running in Node.js/Electron main process
if (typeof require !== 'undefined') {
    try {
        EventEmitter = require('events').EventEmitter;
        net = require('net');
    } catch (e) {
        // Running in browser/renderer without node integration
        console.warn('MacSploit: Node.js modules not available');
    }
} else {
    // ES Module imports (for standalone use)
    if (typeof window === 'undefined') {
        const events = await import('events');
        const netModule = await import('net');
        EventEmitter = events.EventEmitter;
        net = netModule.default;
    }
}

// Fallback EventEmitter for browser environments
if (!EventEmitter) {
    EventEmitter = class SimpleEventEmitter {
        constructor() {
            this._events = {};
        }
        on(event, listener) {
            if (!this._events[event]) this._events[event] = [];
            this._events[event].push(listener);
        }
        once(event, listener) {
            const onceWrapper = (...args) => {
                listener(...args);
                this.off(event, onceWrapper);
            };
            this.on(event, onceWrapper);
        }
        emit(event, ...args) {
            if (!this._events[event]) return;
            this._events[event].forEach(listener => listener(...args));
        }
        off(event, listener) {
            if (!this._events[event]) return;
            this._events[event] = this._events[event].filter(l => l !== listener);
        }
        listenerCount(event) {
            return this._events[event] ? this._events[event].length : 0;
        }
    };
}

export const IpcTypes = {
    IPC_EXECUTE: 0,
    IPC_SETTING: 1
};

export const MessageTypes = {
    PRINT: 1,
    ERROR: 2
};

export class Client extends EventEmitter {
    _host = "127.0.0.1"; // localhost
    _port = 5553; // 5553 ~ 5562 for each roblox window (max 10)
    _socket = null;

    constructor() {
        super();
    }

    /**
     * @returns {net.Socket | null}
     */
    get socket() {
        return this._socket;
    }

    isAttached() {
        return this._socket ? this._socket.readyState === "open" : false;
    }

    /**
     * @param {number} port
     * @returns {Promise<void>}
     */
    attach(port) {
        return new Promise((resolve, reject) => {
            if (this._socket) return reject(new Error("AlreadyInjectedError: Socket is already connected."));

            this._port = port;
            this._socket = net.createConnection(port, this._host);

            let connected = false;
            this._socket.once("connect", () => {
                connected = true;
                resolve();
            });

            this._socket.on("data", (data) => {
                const type = data.at(0);
                if (!type || !(type in MessageTypes)) return; // unknown type

                const length = data.subarray(8, 16).readBigUInt64LE(); // length of output
                const message = data.subarray(16, 16 + Number(length)).toString("utf-8");

                this.emit("message", message, type);
            });

            let lastError = null;
            this._socket.on("timeout", console.error);
            this._socket.on("error", (err) => {
                lastError = err;
                if (this.listenerCount("error") > 0) {
                    this.emit("error", err);
                }
            });
            this._socket.once("close", (hadError) => {
                if (connected) {
                    if (hadError) this.emit("close", lastError);
                    else this.emit("close");
                } else if (hadError) {
                    if (lastError.message.includes("connect ECONNREFUSED")) {
                        reject(new Error("ConnectionRefusedError: Socket is not open."));
                    } else {
                        reject(new Error("ConnectionError: Socket closed due to an error."));
                    }
                } else {
                    reject();
                }
                this._socket = null; // let the gc do its work
            });
        });
    }

    reattach() {
        return this.attach(this._port);
    }

    /**
     * @returns {Promise<void>}
     */
    detach() {
        return new Promise((resolve, reject) => {
            if (!this._socket) return reject(new Error("NotInjectedError: Socket is already closed."));

            this._socket.once("close", (hadError) => {
                if (hadError) return reject(new Error("ConnectionError: Socket closed due to an error."));
                resolve();
                this._socket = null; // let the gc do its work
            });
            this._socket.destroy();
        });
    }

    /**
     * @param {keyof typeof IpcTypes} type
     * @param {number} length
     * @returns {Buffer<ArrayBuffer>}
     */
    _buildHeader(type, length = 0) {
        const data = Buffer.alloc(16 + length + 1); // uint8_t, int
        data.writeUInt8(type, 0);
        data.writeInt32LE(length, 8);
        return data;
    }

    /**
     * @param {string} script
     * @returns {boolean}
     */
    executeScript(script) {
        if (!this._socket) throw new Error("NotInjectedError: Please attach before executing scripts.");

        const encoded = new TextEncoder().encode(script);
        const data = this._buildHeader(IpcTypes.IPC_EXECUTE, encoded.length);
        data.write(script, 16); // data + offset

        return this._socket.write(data); // usually returns true
    }

    /**
     * @param {string} key
     * @param {boolean} value
     * @returns {boolean}
     */
    updateSetting(key, value) {
        if (!this._socket) throw new Error("NotInjectedError: Please attach before executing scripts.");

        const payload = `${key} ${value ? "true" : "false"}`;
        const data = this._buildHeader(IpcTypes.IPC_SETTING, payload.length);
        data.write(payload, 16); // data + offset

        return this._socket.write(data); // usually returns true
    }
}

// Export for both CommonJS and ES Modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Client, IpcTypes, MessageTypes };
} else if (typeof window !== 'undefined') {
    window.MacSploitAPI = { Client, IpcTypes, MessageTypes };
}
