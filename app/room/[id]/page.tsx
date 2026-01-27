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
  const c = (globalThis as any).crypto as Crypto | undefined;

  // Prefer native UUID when available
  try {
    if (c?.randomUUID) return c.randomUUID();
  } catch {}

  // RFC4122 v4 fallback using getRandomValues
  try {
    if (c?.getRandomValues) {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);

      // Set version (4) and variant (10)
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = [...bytes]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      return (
        hex.slice(0, 8) +
        "-" +
        hex.slice(8, 12) +
        "-" +
        hex.slice(12, 16) +
        "-" +
        hex.slice(16, 20) +
        "-" +
        hex.slice(20)
      );
    }
  } catch {}

  // Very old browsers only
  return "00000000-0000-4000-8000-000000000000";
}

function getUserToken() {
  const key = "hs_user_token";
  const existing = sessionStorage.getItem(key);

  const isUuid = (v: any) =>
    typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);

  if (existing && isUuid(existing)) return existing;

  const t = uuid();
  sessionStorage.setItem(key, t);
  return t;
}

// ---------- Manila time helpers (client-safe) ----------
function getManilaNowParts() {
  const now = new Date();

  const tf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const tp = tf.formatToParts(now).reduce<Record<string, string>>((a, p) => {
    if (p.type !== "literal") a[p.type] = p.value;
    return a;
  }, {});

  const hh = Number(tp.hour ?? "0");
  const mm = Number(tp.minute ?? "0");
  const ss = Number(tp.second ?? "0");
  return { hh, mm, ss };
}

function msToMMSS(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Returns ms until 22:00:00 Manila today.
 * If already >= 22:00, returns 0.
 * Uses fixed Manila offset (UTC+8) by constructing target UTC.
 */
function getMsUntilManila10pm() {
  const now = new Date();

  // Date in Manila as YYYY-MM-DD
  const df = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = df.format(now); // YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));

  // 22:00 Manila == 14:00 UTC
  const targetUTC = Date.UTC(y, m - 1, d, 14, 0, 0);

  const { hh, mm, ss } = getManilaNowParts();
  const nowManilaSec = hh * 3600 + mm * 60 + ss;
  const tenPMsec = 22 * 3600;

  if (nowManilaSec >= tenPMsec) return 0;
  return targetUTC - now.getTime();
}
// -----------------------------------------------------------

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

  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ NEW: message list ref + sticky-to-bottom behavior
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  function isNearBottom(el: HTMLDivElement) {
    const threshold = 140; // px
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  // --- local message persistence (refresh-safe, cleared only on End Chat) ---
  const storageKey = useMemo(
    () => (roomId ? `hs_chat_${roomId}` : ""),
    [roomId]
  );

  useEffect(() => {
    if (!roomId) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setMessages(parsed as ChatMsg[]);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, roomId, storageKey]);

  function clearLocalHistory() {
    if (!roomId) return;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
  }
  // ---------------------------------------------------------------------------

  // ---------- banner countdown + auto system-end at 10PM ----------
  const [closeBanner, setCloseBanner] = useState<string>("");
  const autoEndedRef = useRef(false);

  useEffect(() => {
    if (!roomId || ended) return;

    function tick() {
      const msLeft = getMsUntilManila10pm();

      if (msLeft > 0 && msLeft <= 5 * 60 * 1000) {
        setCloseBanner(msToMMSS(msLeft));
      } else {
        setCloseBanner("");
      }

      if (msLeft <= 0 && !autoEndedRef.current) {
        autoEndedRef.current = true;

        (async () => {
          try {
            await fetch("/api/end", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({
                room_id: roomId,
                user_token: userToken,
                mode: "system",
              }),
            }).catch(() => null);
          } finally {
            clearLocalHistory();

            const ch = chRef.current;
            if (ch) {
              try {
                await ch.send({
                  type: "broadcast",
                  event: "end",
                  payload: { by: "system" },
                });
              } catch {}
            }

            setEndedReason("system");
            setEnded(true);
          }
        })();
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userToken, ended]);
  // -------------------------------------------------------------------

  function autosizeTextarea() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }

  // ✅ NEW: keep sticky flag updated when user scrolls
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onScroll = () => {
      stickToBottomRef.current = isNearBottom(el);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    // initialize
    stickToBottomRef.current = isNearBottom(el);

    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // ✅ NEW: auto-scroll ONLY if user is already near bottom
  useEffect(() => {
    if (!listRef.current) return;
    if (!stickToBottomRef.current) return;

    // next frame ensures DOM has the new bubble height
    requestAnimationFrame(() => scrollToBottom("auto"));
  }, [messages.length]);

  // ✅ NEW: when mobile keyboard opens/closes, keep bottom visible if sticky
  useEffect(() => {
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (!vv) return;

    const handler = () => {
      if (stickToBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom("auto"));
      }
    };

    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);
    return () => {
      vv.removeEventListener("resize", handler);
      vv.removeEventListener("scroll", handler);
    };
  }, []);

  // ====== REALTIME LOGIC ======
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
      clearLocalHistory();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, channelName, userToken]);

  // DB watch: if ended_at is set, show ended screen (and clear local history)
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
          clearLocalHistory();
          setEndedReason("system");
          setEnded(true);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // If I'm sending, always stick to bottom
    stickToBottomRef.current = true;

    setMessages((prev) => [...prev, msg]);
    setText("");
    sendTyping(false);
    requestAnimationFrame(() => {
      autosizeTextarea();
      scrollToBottom("auto");
    });

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
        body: JSON.stringify({
          room_id: roomId,
          user_token: userToken,
          mode: "user",
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const apiErr =
          data?.error || data?.message || data?.details || "unknown_error";
        const hint = `End failed (HTTP ${res.status}): ${apiErr}`;

        if (apiErr === "limit_reached") {
          setEndsLeft(0);
          setLimitMsg("You’ve reached your limit: max 2 self-ends per night.");
        } else if (apiErr === "not_participant" || apiErr === "unauthorized") {
          setLimitMsg(
            "End failed: your session token doesn’t match this room (reload the main page and rejoin)."
          );
        } else if (apiErr === "room_not_found") {
          setLimitMsg(
            "End failed: room not found (it may have already closed)."
          );
        } else {
          setLimitMsg(hint);
        }

        setEnding(false);
        return;
      }

      const count = Number(data?.self_end_count ?? 0);
      const left = Math.max(0, 2 - count);
      setEndsLeft(left);

      clearLocalHistory();

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
    } catch (e: any) {
      setLimitMsg(`End failed: network/error (${String(e?.message || e)})`);
      setEnding(false);
    }
  }

  // ====== END SCREEN ======
  if (ended) {
    const subtitle =
      endedReason === "you"
        ? "You ended the chat."
        : endedReason === "other"
        ? "The stranger ended the chat."
        : "Thank you for chatting tonight. See you tomorrow.";

    return (
      <main className="min-h-screen bg-teal-600 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white/90 backdrop-blur border border-teal-100 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)] p-6">
            <h1
              className="text-3xl sm:text-4xl text-teal-700 tracking-wide"
              style={{ fontFamily: "var(--font-chewy)" }}
            >
              Hi, Stranger
            </h1>

            <p className="mt-3 text-gray-700">{subtitle}</p>

            <button
              className="mt-6 w-full rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 py-3 text-white font-medium shadow-md hover:shadow-lg active:scale-[0.98] transition"
              onClick={() => (window.location.href = "/")}
            >
              Back to main page
            </button>
          </div>
        </div>

        <footer className="pb-5 flex justify-center">
          <div className="rounded-2xl border border-teal-100 bg-white/70 backdrop-blur px-4 py-2 text-xs text-gray-700 shadow-sm">
            Hi, Stranger created by Kenjo © 2026
          </div>
        </footer>
      </main>
    );
  }

  // ====== CHAT SCREEN ======
  return (
    <main className="min-h-screen bg-teal-600 flex flex-col">
      {/* Chat area */}
      <div className="flex-1 flex items-center justify-center p-3">
<div className="w-full max-w-md h-[90dvh] sm:h-[720px] rounded-3xl bg-white/90 backdrop-blur border border-teal-100 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col">


          {/* HEADER */}
          <div className="px-4 py-3 bg-gradient-to-r from-teal-50 to-teal-100/50 border-b border-teal-100">
            <div className="flex justify-between items-start">
              <div>
                <h1
                  className="text-2xl sm:text-3xl text-teal-700 tracking-wide"
                  style={{ fontFamily: "var(--font-chewy)" }}
                >
                  Hi, Stranger
                </h1>
                <div className="text-xs text-gray-600">
                  {connected ? "Connected" : "Connecting…"}
                </div>
              </div>

              <div className="text-right">
                <button
                  onClick={endChat}
                  disabled={ending}
                  className={
                    ending
                      ? "text-xs rounded-xl px-3 py-2 bg-gray-200 text-gray-500 cursor-not-allowed"
                      : "text-xs rounded-xl px-3 py-2 bg-white/70 border border-teal-200 text-teal-700 hover:bg-white transition"
                  }
                >
                  {ending ? "Ending…" : "End chat"}
                </button>
                <div className="text-[11px] text-gray-600 mt-1">
                  End limit: <b>{endsLeft}</b>
                </div>
              </div>
            </div>

            {closeBanner ? (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center justify-between">
                <span>Chatroom will close in</span>
                <span className="font-mono font-semibold">{closeBanner}</span>
              </div>
            ) : null}

            {limitMsg && (
              <div className="mt-2 text-xs text-red-600">{limitMsg}</div>
            )}
          </div>

{/* MESSAGES */}
<div
  ref={listRef}
  className="flex-1 min-h-0 p-4 overflow-y-auto bg-white/70"
>


            {messages.length === 0 ? (
              <div className="text-sm text-gray-600">Say hi 👋</div>
            ) : (
              messages.map((m) => {
                const mine = m.from === userToken;
                return (
                  <div
                    key={m.id}
                    className={`${mine ? "flex justify-end" : "flex justify-start"} mb-1.5`}
                  >
                    <div
                      className={
                        mine
                          ? "max-w-[82%] rounded-3xl bg-gradient-to-br from-teal-500 to-teal-600 text-white px-4 py-2 text-sm shadow-[0_10px_24px_-14px_rgba(13,148,136,0.9)] whitespace-pre-wrap break-words"
                          : "max-w-[82%] rounded-3xl bg-white text-gray-800 px-4 py-2 text-sm border border-gray-200 shadow-sm whitespace-pre-wrap break-words"
                      }
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}

            {otherTyping ? (
              <div className="mt-3 text-xs text-gray-600">
                Stranger is typing…
              </div>
            ) : null}
          </div>

          {/* COMPOSER */}
          <div className="p-4 border-t border-teal-100 bg-white/90">
            <div className="flex gap-2 items-end">
              <div className="flex-1 rounded-2xl bg-gray-50 border border-gray-200 px-3 py-2">
                <textarea
                  ref={taRef}
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  onFocus={() => {
                    // When keyboard opens, keep last message visible (if user is sticky)
                    if (stickToBottomRef.current) {
                      requestAnimationFrame(() => scrollToBottom("auto"));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  rows={1}
                  placeholder="Type a message…"
                  className="w-full bg-transparent resize-none text-[16px] outline-none"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!connected || !text.trim()}
                className={
                  connected && text.trim()
                    ? "rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 px-4 py-2 text-white text-sm font-medium shadow-md hover:shadow-lg active:scale-[0.98] transition"
                    : "rounded-2xl bg-gray-200 px-4 py-2 text-gray-500 text-sm font-medium cursor-not-allowed"
                }
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer (always visible) */}
      <footer className="pb-5 flex justify-center">
        <div className="rounded-2xl border border-teal-100 bg-white/70 backdrop-blur px-4 py-2 text-xs text-gray-700 shadow-sm">
          Hi, Stranger created by Kenjo © 2026
        </div>
      </footer>
    </main>
  );
}
