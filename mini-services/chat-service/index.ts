import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3003;

// ── HTTP server (for /health and Socket.IO upgrade) ──────────────────
const httpServer = createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
});

// ── Socket.IO server ─────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ── Authentication middleware ─────────────────────────────────────────
io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.query?.token ||
    null;

  if (!token) {
    return next(new Error("Authentication error: token required"));
  }

  // Attach decoded info to socket for later use
  // In a real app you would verify the JWT here.
  socket.data.token = token;
  socket.data.user = {
    id: socket.handshake.auth?.user_id || socket.handshake.query?.user_id || "unknown",
    name: socket.handshake.auth?.user_name || socket.handshake.query?.user_name || "Anonymous",
    role: socket.handshake.auth?.user_role || socket.handshake.query?.user_role || "Viewer",
  };

  next();
});

// ── Connection handler ───────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[chat-service] Connected: ${socket.id} (user: ${socket.data.user.id})`);

  // ── join-ticket ──────────────────────────────────────────────────
  socket.on("join-ticket", (ticketId: string) => {
    const room = `ticket:${ticketId}`;
    socket.join(room);
    console.log(`[chat-service] ${socket.id} joined ${room}`);
    socket.to(room).emit("user-joined", {
      ticket_id: ticketId,
      user_id: socket.data.user.id,
      user_name: socket.data.user.name,
    });
  });

  // ── leave-ticket ─────────────────────────────────────────────────
  socket.on("leave-ticket", (ticketId: string) => {
    const room = `ticket:${ticketId}`;
    socket.leave(room);
    console.log(`[chat-service] ${socket.id} left ${room}`);
    socket.to(room).emit("user-left", {
      ticket_id: ticketId,
      user_id: socket.data.user.id,
      user_name: socket.data.user.name,
    });
  });

  // ── send-message ─────────────────────────────────────────────────
  socket.on("send-message", (data: {
    ticket_id: string;
    content: string;
    sender_id: string;
    sender_name: string;
    sender_role: "Admin" | "Operator" | "Viewer";
  }) => {
    const { ticket_id, content, sender_id, sender_name, sender_role } = data;

    if (!ticket_id || !content) {
      socket.emit("error", { message: "ticket_id and content are required" });
      return;
    }

    const message = {
      ticket_id,
      content,
      sender_id: sender_id || socket.data.user.id,
      sender_name: sender_name || socket.data.user.name,
      sender_role: sender_role || socket.data.user.role,
      timestamp: new Date().toISOString(),
    };

    const room = `ticket:${ticket_id}`;
    // Broadcast to everyone in the room INCLUDING sender for confirmation
    io.to(room).emit("new-message", message);
    console.log(`[chat-service] Message in ${room}: ${content.slice(0, 50)}`);
  });

  // ── typing ───────────────────────────────────────────────────────
  socket.on("typing", (data: { ticket_id: string }) => {
    const { ticket_id } = data;
    if (!ticket_id) return;

    const room = `ticket:${ticket_id}`;
    // Broadcast to everyone EXCEPT sender
    socket.to(room).emit("typing", {
      ticket_id,
      user_id: socket.data.user.id,
      user_name: socket.data.user.name,
    });
  });

  // ── ticket-updated ───────────────────────────────────────────────
  socket.on("ticket-updated", (data: {
    ticket_id: string;
    status?: string;
    updated_by?: string;
    [key: string]: unknown;
  }) => {
    const { ticket_id } = data;
    if (!ticket_id) return;

    const room = `ticket:${ticket_id}`;
    io.to(room).emit("ticket-updated", {
      ...data,
      timestamp: new Date().toISOString(),
    });
    console.log(`[chat-service] Ticket updated in ${room}`);
  });

  // ── disconnect ───────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    console.log(`[chat-service] Disconnected: ${socket.id} (${reason})`);
  });
});

// ── Start server ──────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[chat-service] Socket.IO server listening on port ${PORT}`);
  console.log(`[chat-service] Health check → http://localhost:${PORT}/health`);
});
