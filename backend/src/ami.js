import net from "node:net";
import { EventEmitter } from "node:events";
import crypto from "node:crypto";

function serialize(fields) {
  return `${Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\r\n")}\r\n\r\n`;
}

function parseFrame(frame) {
  const message = {};
  for (const line of frame.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (message[key] === undefined) message[key] = value;
    else if (Array.isArray(message[key])) message[key].push(value);
    else message[key] = [message[key], value];
  }
  return message;
}

export class AmiClient extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.socket = null;
    this.buffer = "";
    this.connected = false;
    this.stopped = false;
    this.pending = new Map();
    this.reconnectTimer = null;
  }

  start() {
    this.stopped = false;
    this.#connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.destroy();
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error("AMI connection stopped"));
    }
    this.pending.clear();
  }

  #connect() {
    if (this.stopped) return;
    this.socket = net.createConnection(
      { host: this.options.host, port: this.options.port },
      () => {
        this.connected = true;
        this.action({
          Action: "Login",
          Username: this.options.username,
          Secret: this.options.secret,
          Events: "on"
        })
          .then(() => this.emit("connection", true))
          .catch((error) => {
            this.emit("error", error);
            this.socket?.destroy();
          });
      }
    );
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => this.#consume(chunk));
    this.socket.on("error", (error) => this.emit("error", error));
    this.socket.on("close", () => {
      this.connected = false;
      this.emit("connection", false);
      if (!this.stopped) this.reconnectTimer = setTimeout(() => this.#connect(), 3000);
    });
  }

  #consume(chunk) {
    this.buffer += chunk;
    let boundary;
    while ((boundary = this.buffer.indexOf("\r\n\r\n")) >= 0) {
      let raw = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 4);
      if (raw.startsWith("Asterisk Call Manager/")) {
        const bannerEnd = raw.indexOf("\r\n");
        if (bannerEnd < 0) continue;
        raw = raw.slice(bannerEnd + 2);
      }
      if (!raw) continue;
      const message = parseFrame(raw);
      const actionId = message.ActionID;
      if (actionId && this.pending.has(actionId) && message.Response) {
        const pending = this.pending.get(actionId);
        clearTimeout(pending.timer);
        this.pending.delete(actionId);
        if (message.Response === "Success") pending.resolve(message);
        else pending.reject(new Error(message.Message || "AMI action failed"));
      }
      if (message.Event) this.emit("event", message);
      this.emit("message", message);
    }
  }

  action(fields, timeoutMs = 8000) {
    if (!this.connected || !this.socket?.writable) {
      return Promise.reject(new Error("AMI is not connected"));
    }
    const actionId = fields.ActionID || crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(actionId);
        reject(new Error(`AMI action timed out: ${fields.Action}`));
      }, timeoutMs);
      this.pending.set(actionId, { resolve, reject, timer });
      this.socket.write(serialize({ ...fields, ActionID: actionId }));
    });
  }
}

export { parseFrame };