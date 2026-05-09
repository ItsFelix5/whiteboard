import cors from "@fastify/cors";
import websocketPlugin from "@fastify/websocket";
import { Database } from "bun:sqlite";
import { createWriteStream, mkdir } from "fs";
import { readFile } from "fs/promises";
import fastify from "fastify";
import { join } from "path";
import type { RawData } from "ws";
import _unfurl from "unfurl.js";
import { pipeline } from "stream/promises";
import {
  SQLiteSyncStorage,
  TLSocketRoom,
  type TLSqliteInputValue,
  type TLSqliteRow,
  type TLSyncSqliteStatement,
} from "@tldraw/sync-core";

mkdir("./.assets", ()=>{});
const db = new Database("./rooms.db");
const storage = new SQLiteSyncStorage({
  sql: {
    exec: (sql) => db.run(sql),
    prepare<
      TResult extends TLSqliteRow | void = void,
      TParams extends TLSqliteInputValue[] = TLSqliteInputValue[],
    >(sql: string): TLSyncSqliteStatement<TResult, TParams> {
      const statement = db.query(sql);
      return {
        iterate: (...bindings: TParams) =>
          statement.iterate(...bindings) as IterableIterator<TResult>,
        all: (...bindings: TParams) => statement.all(...bindings) as TResult[],
        run: (...bindings: TParams) => {
          statement.run(...bindings);
        },
      };
    },
    transaction: (callback) => {
      db.run("BEGIN");
      try {
        const result = callback();
        db.run("COMMIT");
        return result;
      } catch (error) {
        db.run("ROLLBACK");
        throw error;
      }
    },
  },
});
const rooms = new Map<string, TLSocketRoom>();

const server = fastify();
server.register(websocketPlugin);
server.register(cors, { origin: "*" });
server.register(async (server) => {
  server.get<{
    Params: { roomId: string };
    Querystring: { sessionId?: string };
  }>("/connect/:roomId", { websocket: true }, async (socket, req) => {
    const sessionId = req.query?.sessionId ?? crypto.randomUUID();

    const caught: RawData[] = [];
    const collect = (message: RawData) => caught.push(message);
    socket.on("message", collect);

    const roomId = req.params.roomId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const existing = rooms.get(roomId);
    if (existing && !existing.isClosed()) return existing;

    const room = new TLSocketRoom({
      storage,
      onSessionRemoved(room, { numSessionsRemaining }) {
        if (numSessionsRemaining === 0) {
          room.close();
          rooms.delete(roomId);
        }
      },
    });

    rooms.set(roomId, room);
    room.handleSocketConnect({ sessionId, socket });

    socket.off("message", collect);
    for (const message of caught) socket.emit("message", message);
  });

  server.addContentTypeParser("*", (_, __, done) => done(null));
  server.put<{ Params: { id: string } }>(
    "/uploads/:id",
    {},
    async (req, res) => {
      await pipeline(
        req.raw,
        createWriteStream(join("./.assets", req.params?.id)),
      );
      res.send({ ok: true });
    },
  );

  server.get<{ Params: { id: string } }>("/uploads/:id", async (req, res) => {
    const data = await readFile(join("./.assets", req.params?.id));
    res.header("Content-Security-Policy", "default-src 'none'");
    res.header("X-Content-Type-Options", "nosniff");
    res.send(data);
  });

  server.get<{ Querystring: { url: string } }>("/unfurl", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send({ error: "Missing url" });
    const { title, description, open_graph, twitter_card, favicon } =
      await _unfurl.unfurl(url);
    res.send({
      title,
      description,
      image: open_graph?.images?.[0]?.url || twitter_card?.images?.[0]?.url,
      favicon,
    });
  });
});

server.post<{ Body: string }>("/command/whiteboard", async (req, res) => {
  const id = Math.random().toString(36);
  const params = new URLSearchParams(req.body);
  fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: 'Bearer ' + process.env.SLACK_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: params.get("channel_id"),
      text: "Whiteboard",
      blocks: [
        {
          type: "video",
          video_url: `https://whiteboard.felix.hackclub.app/${id}`,
          title_url: `https://whiteboard.felix.hackclub.app/${id}`,
          thumbnail_url:
            "https://stylesatlife.com/wp-content/uploads/2022/05/brown-rat.jpg",
          title: { type: "plain_text", text: "Whiteboard" },
          alt_text: "Whiteboard",
        },
      ],
    }),
  });
  res.code(200);
});

const index = await Bun.file(join(import.meta.dirname, "dist/index.html")).text();
server.get("/:roomId", async (req, res) => {
  res.header("content-type", "text/html");
  res.send(index);
});

await server.listen({ port: 5858, host: "0.0.0.0" });
