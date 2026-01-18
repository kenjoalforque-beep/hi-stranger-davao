"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type ChatMsg = {
  id: string;
  from: string;
  text: string;
  ts: number;
};

function uuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `x_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function getUserToken() {
  const key = "hs_user_token";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const t = uuid();
  sessionStorage.setItem(key, t);
  return t;
}

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params?.id as string | undefined;

  const userToken = useMemo(() => getUserToken(), []);
  const channelName = useMemo(() => (roomId ? `room:${roomId}` : ""), [roomId]);

  const chRef = useRef<any>(null);

  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);

  const [ending, setEnding] = useState(false);
  const [ended, setEnded] = useState(false);
  const [endedReason, setEndedReason] = useState<"you" | "other" | "system">(
    "system"
  );

  const [limitMsg, setLimitMsg] = useState<string>("");
  const [endsLeft, setEndsLeft] = useState<number>(2);

  const otherTypingTimer = useRef<any>(null);
  const myTypingTimer = useRef<any>(null);

  // Realtime: messages + typing + end
  useEffect(() => {
    if (!roomId) return;

    try {
      if (chRef.current) supabaseBrowser.removeChannel(chRef.current);
    } catch {}
    chRef.current = null;

    const ch = supabaseBrowser.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    chRef.current = ch;

    ch.on("broadcast", { event: "message" }, (payload) => {
      const p = payload.payload as any;
      if (!p?.id || !p?.text || !p?.from || !p?.ts) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === p.id)) return prev;
        return [...prev, { id: p.id, text: p.text, from: p.from, ts: p.ts }];
      });
    });

    ch.on("broadcast", { event: "typing" }, (payload) => {
      const p = payload.payload as any;
      if (!p?.from || p.from === userToken) return;

      setOtherTyping(Boolean(p.typing));

      if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
      if (p.typing) {
        otherTypingTimer.current = setTimeout(
          () => setOtherTyping(false),
          1500
        );
      }
    });

    // Other user ended
    ch.on("broadcast", { event: "end" }, () => {
      setEndedReason("other");
      setEnded(true);
    });

    ch.subscribe((status: any) => {
      setConnected(status === "SUBSCRIBED");
    });

    return () => {
      try {
        supabaseBrowser.removeChannel(ch);
      } catch {}
      chRef.current = null;
      setConnected(false);
      if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
      if (myTypingTimer.current) clearTimeout(myTypingTimer.current);
    };
  }, [roomId, channelName, userToken]);

  // DB watch: if ended_at is set, show ended screen
  useEffect(() => {
    if (!roomId) return;

    const interval = setInterval(async () => {
      try {
        const { data } = await supabaseBrowser
          .from("rooms")
          .select("ended_at")
          .eq("id", roomId)
          .maybeSingle();

        if (data?.ended_at) {
          setEndedReason("system");
          setEnded(true);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [roomId]);

  // Load tonight's remaining self-end limit (persists across new chats)
  useEffect(() => {
    async function loadLimit() {
      try {
        const res = await fetch("/api/limit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ user_token: userToken }),
        });

        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) {
          setEndsLeft(Number(data.ends_left ?? 2));
        }
      } catch {
        // ignore
      }
    }

    loadLimit();
  }, [userToken]);

  function sendTyping(typing: boolean) {
    const ch = chRef.current;
    if (!ch || ended) return;

    ch.send({
      type: "broadcast",
      event: "typing",
      payload: { from: userToken, typing },
    });
  }

  function handleTextChange(v: string) {
    setText(v);
    if (ended) return;

    sendTyping(true);
    if (myTypingTimer.current) clearTimeout(myTypingTimer.current);
    myTypingTimer.current = setTimeout(() => sendTyping(false), 900);
  }

  async function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || ended) return;

    const ch = chRef.current;
    if (!ch) return;

    const msg: ChatMsg = {
      id: uuid(),
      from: userToken,
      text: trimmed,
      ts: Date.now(),
    };

    setMessages((prev) => [...prev, msg]);
    setText("");
    sendTyping(false);

    await ch.send({ type: "broadcast", event: "message", payload: msg });
  }

  async function endChat() {
    if (!roomId || ending || ended) return;

    setLimitMsg("");
    setEnding(true);

    try {
      const res = await fetch("/api/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ room_id: roomId, user_token: userToken }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        if (data?.error === "limit_reached") {
          setEndsLeft(0);
          setLimitMsg("You’ve reached your limit: max 2 self-ends per night.");
          setEnding(false);
          return;
        }
        setLimitMsg("Something went wrong. Please try again.");
        setEnding(false);
        return;
      }

      const count = Number(data?.self_end_count ?? 0);
      const left = Math.max(0, 2 - count);
      setEndsLeft(left);

      // Notify other user immediately
      const ch = chRef.current;
      if (ch) {
        await ch.send({ type: "broadcast", event: "end", payload: { by: userToken } });
      }

      setEndedReason("you");
      setEnded(true);
      setEnding(false);
    } catch {
      setLimitMsg("Connection issue. Please try again.");
      setEnding(false);
    }
  }

  // End screen
  if (ended) {
    const subtitle =
      endedReason === "you"
        ? "You ended the chat."
        : endedReason === "other"
        ? "The stranger ended the chat."
        : "This chat has ended.";

    return (
      <main className="min-h-screen bg-white flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-teal-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold text-teal-700">
              Your chat has ended.
            </h1>
            <p className="mt-2 text-sm text-gray-700">{subtitle}</p>

            <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-gray-800 flex items-center gap-2">
              <span className="text-teal-500 text-lg">♥</span>
              <span>Thank you for being here tonight.</span>
            </div>

            <div className="mt-3 text-xs text-gray-600">
              End chat limit left: <b>{endsLeft}</b>
            </div>

            <button
              className="mt-4 w-full rounded-xl bg-teal-600 py-3 font-medium text-white hover:bg-teal-700 transition"
              onClick={() => (window.location.href = "/")}
            >
              Back to main page
            </button>
          </div>
        </div>

        <footer className="pb-4 flex justify-center">
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-xs text-gray-700">
            Original concept by Kenjo © 2026
          </div>
        </footer>
      </main>
    );
  }

  // Normal chat screen
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-teal-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-teal-100 bg-teal-50">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-teal-700">Hi, Stranger</h1>

              <button
                onClick={endChat}
                disabled={ending}
                className={
                  ending
                    ? "text-xs rounded-xl px-3 py-2 bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "text-xs rounded-xl px-3 py-2 bg-white border border-teal-200 text-teal-700 hover:bg-teal-100 transition"
                }
              >
                {ending ? "Ending…" : "End chat"}
              </button>
            </div>

            <div className="mt-1 text-xs text-gray-600">
              Room: <span className="font-mono">{roomId}</span> •{" "}
              {connected ? "Connected" : "Connecting…"}
            </div>

            <div className="mt-2 text-xs text-gray-600">
              End chat limit left: <b>{endsLeft}</b>
            </div>

            {limitMsg ? <div className="mt-2 text-xs text-red-600">{limitMsg}</div> : null}
          </div>

          <div className="p-4 h-[420px] overflow-y-auto bg-white">
            {messages.length === 0 ? (
              <div className="text-sm text-gray-600">
                Say hi 👋 (No history — messages disappear on refresh.)
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const mine = m.from === userToken;
                  return (
                    <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={
                          mine
                            ? "max-w-[80%] rounded-2xl bg-teal-600 text-white px-4 py-2 text-sm"
                            : "max-w-[80%] rounded-2xl bg-gray-100 text-gray-800 px-4 py-2 text-sm"
                        }
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {otherTyping ? (
              <div className="mt-3 text-xs text-gray-600">Stranger is typing…</div>
            ) : null}
          </div>

          <div className="p-4 border-t border-teal-100 bg-white">
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
                placeholder="Type a message…"
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-300"
              />
              <button
                onClick={sendMessage}
                disabled={!connected || text.trim().length === 0}
                className={
                  connected && text.trim().length > 0
                    ? "rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition"
                    : "rounded-xl bg-gray-200 px-4 py-2 text-sm font-medium text-gray-500 cursor-not-allowed"
                }
              >
                Send
              </button>
            </div>

            <div className="mt-2 text-xs text-gray-600">
              No photos. No GIFs. Be kind.
            </div>
          </div>
        </div>
      </div>

      <footer className="pb-4 flex justify-center">
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-xs text-gray-700">
          Original concept by Kenjo © 2026
        </div>
      </footer>
    </main>
  );
}
