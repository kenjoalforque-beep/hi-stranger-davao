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
  const [endedReason, setEndedReason] =
    useState<"you" | "other" | "system">("system");

  const [limitMsg, setLimitMsg] = useState<string>("");
  const [endsLeft, setEndsLeft] = useState<number>(2);

  const otherTypingTimer = useRef<any>(null);
  const myTypingTimer = useRef<any>(null);

  // Auto-scroll anchor
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // textarea autosize (max 3 lines)
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  function autosizeTextarea() {
    const el = taRef.current;
    if (!el) return;

    el.style.height = "auto";
    const maxPx = 96; // ~3 lines depending on padding/font
    el.style.height = Math.min(el.scrollHeight, maxPx) + "px";
  }

  // Auto-scroll when message count changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

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

  // Load tonight's remaining self-end limit
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
      } catch {}
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
    requestAnimationFrame(autosizeTextarea);

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
    requestAnimationFrame(autosizeTextarea);

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

      const ch = chRef.current;
      if (ch) {
        await ch.send({
          type: "broadcast",
          event: "end",
          payload: { by: userToken },
        });
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
      <main className="h-[100dvh] bg-white flex flex-col">
        <div className="flex-1 flex items-center justify-center p-3">
          <div className="w-full max-w-md rounded-2xl border border-teal-200 bg-white shadow-sm overflow-hidden p-6">
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
            Hi, Stranger created by Kenjo © 2026
          </div>
        </footer>
      </main>
    );
  }

  // Normal chat screen (STABLE)
  return (
    <main className="h-[100dvh] bg-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-3">
        <div className="w-full max-w-md h-[100dvh] sm:h-auto sm:max-h-[720px] rounded-2xl border border-teal-200 bg-white shadow-sm overflow-hidden flex flex-col">

          {/* Header (compact left/right) */}
          <div className="px-4 py-3 border-b border-teal-100 bg-teal-50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-teal-700 leading-tight">
                  Hi, Stranger
                </div>
                <div className="mt-0.5 text-xs text-gray-600 leading-tight">
                  {connected ? "Connected" : "Connecting…"}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
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

                <div className="text-[11px] text-gray-600 leading-tight">
                  End chat limit: <b>{endsLeft}</b>
                </div>
              </div>
            </div>

            {limitMsg ? (
              <div className="mt-2 text-xs text-red-600">{limitMsg}</div>
            ) : null}
          </div>

          {/* Messages scroll area */}
          <div className="p-4 flex-1 overflow-y-auto bg-white">
            {messages.length === 0 ? (
              <div className="text-sm text-gray-600">
                Say hi 👋 (No history — messages disappear on refresh.)
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const mine = m.from === userToken;
                  return (
                    <div
                      key={m.id}
                      className={mine ? "flex justify-end" : "flex justify-start"}
                    >
                      <div
                        className={
                          mine
                            ? "max-w-[80%] rounded-2xl bg-teal-600 text-white px-4 py-2 text-sm whitespace-pre-wrap break-words"
                            : "max-w-[80%] rounded-2xl bg-gray-100 text-gray-800 px-4 py-2 text-sm whitespace-pre-wrap break-words"
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

            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="p-4 border-t border-teal-100 bg-white pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <div className="flex gap-2 items-end">
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                rows={1}
                placeholder="Type a message…"
                className="flex-1 resize-none overflow-y-auto rounded-xl border border-gray-200 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-teal-300"
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
          Hi, Stranger created by Kenjo © 2026
        </div>
      </footer>
    </main>
  );
}
