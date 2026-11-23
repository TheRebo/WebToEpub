/**
 * A minimal Marionette client.
 *
 * Marionette is Firefox's own automation protocol. It speaks a small
 * length-prefixed JSON framing over TCP, and it is built into every Firefox
 * build — no Geckodriver, no patched browser, no extra download.
 *
 * That matters here: the point of the end-to-end checks is to drive the
 * **real extension**, installed the **real way**, in the **real browser**. A
 * patched browser would test a different artefact from the one a user
 * installs.
 *
 * The wire format is:
 *
 *     <byte length>:<JSON payload>
 *
 * where the payload is `[0, id, command, params]` for a command and
 * `[1, id, error, result]` for a reply.
 *
 * @see https://firefox-source-docs.mozilla.org/marionette/
 */
import { connect } from "node:net";

/** The default port Marionette listens on. */
export const DEFAULT_PORT = 2828;

/**
 * Try to open a socket, once.
 *
 * @param {number} port The port to connect to.
 * @returns {Promise<import("node:net").Socket>} The connected socket.
 */
function tryConnect(port) {
    return new Promise((resolve, reject) => {
        const socket = connect({ port, host: "127.0.0.1" });
        socket.once("connect", () => {
            socket.removeListener("error", reject);
            resolve(socket);
        });
        socket.once("error", reject);
    });
}

/** A Marionette client. */
export class Marionette {
    #socket;
    #buffer = Buffer.alloc(0);
    #pending = new Map();
    #nextId = 1;
    #handshake;

    /**
     * Connect to a Marionette server.
     *
     * @param {number} port The port to connect to.
     * @param {number} timeoutMs How long to wait for the connection.
     */
    constructor(port = DEFAULT_PORT, timeoutMs = 30_000) {
        this.#handshake = this.#connect(port, timeoutMs);
    }

    /**
     * Connect to the Marionette server, retrying while it is still starting.
     *
     * Firefox opens the port a moment after the process starts, so the first
     * connection attempts are refused. Retrying here is simpler than making
     * every caller deal with the race.
     *
     * @param {number} port The port to connect to.
     * @param {number} timeoutMs How long to keep trying.
     * @returns {Promise<void>} Resolves once connected.
     */
    async #connect(port, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            try {
                const socket = await tryConnect(port);
                this.#socket = socket;
                socket.on("data", (chunk) => this.#onData(chunk));
                return;
            } catch (error) {
                if (Date.now() >= deadline) {
                    throw new Error(
                        `Timed out connecting to Marionette on port ${port}. ${error.message}`,
                    );
                }
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
    }

    /** Wait for the server's handshake. */
    async ready() {
        await this.#handshake;
    }

    /**
     * Send a command.
     *
     * @param {string} command The command's name.
     * @param {unknown} parameters The command's parameters.
     * @returns {Promise<unknown>} The command's result.
     */
    async send(command, parameters = {}) {
        const id = this.#nextId++;
        const message = JSON.stringify([0, id, command, parameters]);
        const payload = Buffer.from(message, "utf8");
        const framed = Buffer.concat([Buffer.from(`${payload.length}:`, "ascii"), payload]);

        const response = new Promise((resolve, reject) => {
            this.#pending.set(id, { resolve, reject });
        });

        this.#socket.write(framed);
        const result = await response;
        if (result.error) {
            throw new Error(`${result.error.error}: ${result.error.message}`);
        }
        return result.result;
    }

    /** Close the connection. */
    close() {
        this.#socket.destroy();
    }

    /** Handle an incoming chunk. */
    #onData(chunk) {
        this.#buffer = Buffer.concat([this.#buffer, chunk]);

        for (;;) {
            const separator = this.#buffer.indexOf(0x3a); // ":"
            if (separator < 0) return;

            const lengthText = this.#buffer.subarray(0, separator).toString("ascii");
            if (!/^\d+$/.test(lengthText)) {
                // Not a length prefix yet — wait for more bytes.
                return;
            }

            const length = Number(lengthText);
            const start = separator + 1;
            if (this.#buffer.length < start + length) return;

            const body = this.#buffer.subarray(start, start + length).toString("utf8");
            this.#buffer = this.#buffer.subarray(start + length);

            let message;
            try {
                message = JSON.parse(body);
            } catch {
                continue;
            }
            this.#dispatch(message);
        }
    }

    /** Route a decoded message. */
    #dispatch(message) {
        if (!Array.isArray(message) || message.length < 4) return;

        const id = message[1];
        const error = message[2];
        const result = message[3];
        const pending = this.#pending.get(id);
        if (!pending) return;
        this.#pending.delete(id);

        if (error) {
            const failure = error;
            pending.reject(new Error(`${failure.error}: ${failure.message}`));
            return;
        }
        pending.resolve({ result });
    }
}
