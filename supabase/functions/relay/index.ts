import { createServer } from "node:http";
import { WebSocketServer } from "npm:ws";
import type {
  RawData,
  WebSocketServer as _WebSocketServer,
} from "npm:@types/ws";
import { RealtimeClient } from "https://raw.githubusercontent.com/openai/openai-realtime-api-beta/refs/heads/main/lib/client.js";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const server = createServer();
// Since we manually created the HTTP server,
// turn on the noServer mode.
const wss: _WebSocketServer = new WebSocketServer({ noServer: true });

wss.on("connection", async (ws) => {
  console.log("socket opened");
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  // Instantiate new client
  console.log(`Connecting with key "${OPENAI_API_KEY.slice(0, 3)}..."`);
  const client = new RealtimeClient({ apiKey: OPENAI_API_KEY });

  // Relay: OpenAI Realtime API Event -> Browser Event
  client.realtime.on("server.*", (event: any) => {
    console.log(`Relaying "${event.type}" to Client`);
    ws.send(JSON.stringify(event));
  });
  client.realtime.on("close", () => ws.close());

  // Relay: Browser Event -> OpenAI Realtime API Event
  // We need to queue data waiting for the OpenAI connection
  const messageQueue: RawData[] = [];
  const messageHandler = (data: any) => {
    try {
      const event = JSON.parse(data);
      console.log(`Relaying "${event.type}" to OpenAI`);
      client.realtime.send(event.type, event);
    } catch (e) {
      console.error(e.message);
      console.log(`Error parsing event from client: ${data}`);
    }
  };

  ws.on("message", (data) => {
    if (!client.isConnected()) {
      messageQueue.push(data);
    } else {
      messageHandler(data);
    }
  });
  ws.on("close", () => client.disconnect());

  // Connect to OpenAI Realtime API
  try {
    console.log(`Connecting to OpenAI...`);
    await client.connect();
  } catch (e) {
    console.log(`Error connecting to OpenAI: ${e.message}`);
    ws.close();
    return;
  }
  console.log(`Connected to OpenAI successfully!`);
  while (messageQueue.length) {
    messageHandler(messageQueue.shift());
  }
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(8080);
