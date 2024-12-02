const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

Deno.serve(async (req) => {
  const upgrade = req.headers.get("upgrade") || "";

  if (upgrade.toLowerCase() != "websocket") {
    return new Response("request isn't trying to upgrade to websocket.");
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    // initiate an outbound WS connection with OpenAI
    const url =
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

    // openai-insecure-api-key isn't a problem since this code runs in an Edge Function (not client browser)
    const openaiWS = new WebSocket(url, [
      "realtime",
      `openai-insecure-api-key.${OPENAI_API_KEY}`,
      "openai-beta.realtime-v1",
    ]);

    // Relay: Browser Event -> OpenAI Realtime API Event
    // We need to queue data waiting for the OpenAI connection
    const messageQueue: any[] = [];
    const messageHandler = (data: any) => {
      try {
        const event = JSON.parse(data);
        console.log(`Relaying "${event.type}" to OpenAI`);
        openaiWS.send(data);
      } catch (e) {
        console.error(e.message);
        console.log(`Error parsing event from client: ${data}`);
      }
    };

    socket.onmessage = (e) => {
      console.log("socket message:", e.data);
      // only send the message if openAI ws is open
      if (openaiWS.readyState === 1) {
        messageHandler(e.data);
      } else {
        messageQueue.push(e.data);
      }
    };

    openaiWS.onopen = () => {
      console.log("Connected to OpenAI server.");
      while (messageQueue.length) {
        messageHandler(messageQueue.shift());
      }
    };

    openaiWS.onmessage = (e) => {
      console.log(e.data);
      socket.send(e.data);
    };

    openaiWS.onerror = (e) => console.log("OpenAI error: ", e.message);
    openaiWS.onclose = (e) => console.log("OpenAI session closed");
  };

  socket.onerror = (e) => console.log("socket errored:", e.message);
  socket.onclose = () => console.log("socket closed");

  return response; // 101 (Switching Protocols)
});
