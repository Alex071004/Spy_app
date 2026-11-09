import {
  PROTOCOL_VERSION,
  ServerMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from "@spyapp/shared";

export type Viewport = Pick<Extract<ClientMessage, { t: "view" }>, "bbox" | "z">;
type Subscription = Extract<ClientMessage, { t: "sub" }>;
export type LayerMessage = Extract<ServerMessage, { t: "snap" | "delta" }>;
export type ConnectionState = "connecting" | "waiting" | "live" | "reconnecting" | "incompatible";
export type StreamIssue = "invalid" | "server" | null;

/** Минимальная поверхность транспорта позволяет проверять жизненный цикл без сети. */
export interface LiveSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "close" | "error", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

interface LiveClientOptions {
  url: string;
  onMessage: (message: LayerMessage) => void;
  onState: (state: ConnectionState) => void;
  onIssue: (issue: StreamIssue) => void;
  socketFactory?: (url: string) => LiveSocket;
  random?: () => number;
}

/** Один WS: hello → sub → snap/delta. Каждое новое соединение требует нового snap. */
export class LiveClient {
  private socket: LiveSocket | null = null;
  private subscription: Subscription;
  private greeted = false;
  private stopped = true;
  private terminal = false;
  private attempt = 0;
  private clockOffset = 0;
  private awaiting = new Set<string>();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly options: LiveClientOptions,
    subscription: Omit<Subscription, "t">,
  ) {
    this.subscription = { t: "sub", ...subscription };
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.terminal = false;
    this.connect();
  }

  serverNow() {
    return Date.now() + this.clockOffset;
  }

  setSubscription(layers: Subscription["layers"], viewport: Viewport) {
    const changed = this.subscription.layers.join(",") !== layers.join(",");
    const viewChanged =
      JSON.stringify([this.subscription.bbox, this.subscription.z]) !==
      JSON.stringify([viewport.bbox, viewport.z]);
    this.subscription = { t: "sub", layers: [...layers], ...viewport };
    if (!this.greeted || this.terminal) return;
    if (changed) {
      clearTimeout(this.watchdog);
      this.awaiting = new Set(layers);
      this.options.onState("waiting");
      this.send(this.subscription);
    } else if (viewChanged) this.send({ t: "view", ...viewport });
  }

  private connect() {
    if (this.stopped || this.terminal) return;
    this.options.onState(this.attempt ? "reconnecting" : "connecting");
    this.greeted = false;
    let socket: LiveSocket;
    try {
      socket = (this.options.socketFactory ?? ((url) => new WebSocket(url)))(this.options.url);
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    const current = () => !this.stopped && !this.terminal && this.socket === socket;
    this.armWatchdog(socket, 8000);
    socket.addEventListener("message", (event) => {
      if (current()) this.receive(event.data);
    });
    const lost = () => {
      if (!current()) return;
      this.socket = null;
      this.greeted = false;
      clearTimeout(this.watchdog);
      socket.close();
      this.retry();
    };
    socket.addEventListener("close", lost);
    socket.addEventListener("error", lost);
  }

  private receive(raw: unknown) {
    let data: unknown;
    try {
      if (typeof raw !== "string") throw new Error("Expected JSON text");
      data = JSON.parse(raw);
    } catch {
      this.options.onIssue("invalid");
      return;
    }
    const parsed = ServerMessageSchema.safeParse(data);
    if (!parsed.success) {
      this.options.onIssue("invalid");
      return;
    }
    const message = parsed.data;
    if (message.t === "hello") {
      if (message.protocol !== PROTOCOL_VERSION) {
        this.terminal = true;
        this.greeted = false;
        clearTimeout(this.watchdog);
        clearTimeout(this.reconnectTimer);
        this.options.onState("incompatible");
        this.socket?.close();
        this.socket = null;
        return;
      }
      if (this.greeted) return;
      this.greeted = true;
      this.clockOffset = message.time - Date.now();
      this.attempt = 0;
      clearTimeout(this.watchdog);
      this.awaiting = new Set(this.subscription.layers);
      this.options.onIssue(null);
      this.options.onState("waiting");
      this.send(this.subscription);
      return;
    }
    if (!this.greeted) {
      this.options.onIssue("invalid");
      return;
    }
    if (message.t === "error") {
      this.options.onIssue("server");
      return;
    }
    // Пакеты прежней подписки могут ещё находиться в очереди сокета.
    if (!this.subscription.layers.includes(message.layer)) return;
    const objects = message.t === "snap" ? message.items : message.up;
    if (objects.some((item) => item.layer !== message.layer)) {
      this.options.onIssue("invalid");
      return;
    }
    if (message.t === "delta" && this.awaiting.has(message.layer)) return;
    if (message.t === "snap") this.awaiting.delete(message.layer);
    this.options.onIssue(null);
    this.options.onMessage(message);
    this.options.onState("live");
    if (this.socket) this.armWatchdog(this.socket, 15_000);
  }

  private send(message: ClientMessage) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  private armWatchdog(socket: LiveSocket, delay: number) {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (this.stopped || this.terminal || this.socket !== socket) return;
      this.socket = null;
      this.greeted = false;
      socket.close();
      this.retry();
    }, delay);
  }

  private retry() {
    if (this.stopped || this.terminal) return;
    this.options.onState("reconnecting");
    const base = Math.min(30_000, 1000 * 2 ** Math.min(this.attempt++, 5));
    const jitter = 0.8 + (this.options.random ?? Math.random)() * 0.4;
    this.reconnectTimer = setTimeout(() => this.connect(), Math.min(30_000, base * jitter));
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.watchdog);
    this.socket?.close();
    this.socket = null;
    this.greeted = false;
  }
}
