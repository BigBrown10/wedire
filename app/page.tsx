"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ProEditor } from "./components/ProEditor";

// ─── Types ───
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface BriefData {
  title?: string;
  audience?: string;
  tone?: string;
  keyMessages?: string[];
  style?: string;
  duration?: number;
  constraints?: string[];
  voiceId?: string;
}

interface VoiceOption {
  voiceId: string;
  name: string;
  category: string;
}

interface PipelineStep {
  name: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
  durationMs?: number;
}

type AppMode = "landing" | "chat" | "generating" | "review";

// ─── Main App ───
export default function Home() {
  const [mode, setMode] = useState<AppMode>("landing");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [brief, setBrief] = useState<BriefData>({});
  const [isTyping, setIsTyping] = useState(false);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [pipelineResult, setPipelineResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch voices on mount
  useEffect(() => {
    fetch("/api/voices")
      .then(res => res.json())
      .then(data => {
        if (data.voices) {
          setAvailableVoices(data.voices);
        }
      })
      .catch(err => console.error("Failed to fetch voices", err));
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Chat Logic ───
  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg],
        }),
      });

      if (!response.ok) throw new Error("Chat failed");

      const data = await response.json();

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: "assistant",
        content: data.response,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Update brief if returned
      if (data.brief) {
        setBrief(data.brief);
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  }, [inputValue, messages, isTyping]);

  // ─── Generate Video ───
  const handleGenerate = useCallback(async () => {
    setMode("generating");
    setError(null);

    const steps: PipelineStep[] = [
      { name: "brief", label: "Brief", status: "pending" },
      { name: "script", label: "Script", status: "pending" },
      { name: "critic", label: "Review", status: "pending" },
      { name: "footage", label: "Footage", status: "pending" },
      { name: "voice", label: "Voice", status: "pending" },
      { name: "audio", label: "Music", status: "pending" },
      { name: "assembly", label: "Assembly", status: "pending" },
      { name: "qa", label: "QA", status: "pending" },
      { name: "render", label: "Render", status: "pending" },
    ];
    setPipelineSteps(steps);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatHistory: messages,
          brief,
          voiceId: brief.voiceId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Generation failed");
      }

      // Stream events from SSE
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || ""; // Keep partial block in buffer

          for (const block of blocks) {
            const line = block.split("\n").find(l => l.startsWith("data: "));
            if (!line) continue;

            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "node_start") {
                setPipelineSteps(prev => prev.map(s =>
                  s.name === event.node ? { ...s, status: "running" } : s
                ));
              } else if (event.type === "node_complete") {
                setPipelineSteps(prev => prev.map(s =>
                  s.name === event.node ? { ...s, status: "done", durationMs: event.durationMs } : s
                ));
              } else if (event.type === "node_error") {
                setPipelineSteps(prev => prev.map(s =>
                  s.name === event.node ? { ...s, status: "failed" } : s
                ));
              } else if (event.type === "pipeline_complete") {
                // Store full pipeline artifacts for the review panel
                setPipelineResult(event);
                
                // If we have a successful render, switch to review mode
                if (event.renderJob?.status === "done") {
                  setMode("review");
                  if (event.renderJob.outputPath) {
                    setVideoUrl(event.renderJob.outputPath);
                  }
                } else if (!error) {
                  // If it finished but didn't render (e.g. QA failed), show error
                  setError("Video generation halted. Check QA status.");
                }
              } else if (event.type === "video_ready") {
                setVideoUrl(event.url);
              } else if (event.type === "pipeline_error") {
                setError(event.error as string);
                // Stay in generating mode so user can see where it failed
              }
            } catch (e) {
              console.error("Failed to parse SSE event:", e);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setMode("chat");
    }
  }, [messages, brief]);

  // ─── Render ───
  return (
    <>
      {/* Header */}
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span className="app-logo" onClick={() => setMode("landing")} style={{ cursor: "pointer" }}>
            WEDIRE
          </span>
          {mode !== "landing" && (
            <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
              Studio
            </span>
          )}
        </div>
        <nav className="app-nav">
          {mode !== "landing" && (
            <button className="btn btn-ghost" onClick={() => setMode("landing")}>
              ← Projects
            </button>
          )}
        </nav>
      </header>

      <main className="app-main">
        {/* ─── Landing ─── */}
        {mode === "landing" && (
          <div className="animate-in" style={{ textAlign: "center", paddingTop: "80px" }}>
            <h1 style={{ fontSize: "3.5rem", fontWeight: 800, marginBottom: "16px" }}>
              <span className="text-gradient">AI Video Engine</span>
            </h1>
            <p style={{ fontSize: "18px", color: "var(--text-secondary)", maxWidth: "600px", margin: "0 auto 48px" }}>
              Describe your video in conversation. Get a near-production-quality result in minutes.
              Voiceover, b-roll, music, motion — all handled.
            </p>

            <button
              className="btn btn-primary"
              style={{ padding: "16px 40px", fontSize: "16px", borderRadius: "var(--radius-xl)" }}
              onClick={() => {
                setMode("chat");
                setMessages([{
                  id: "msg-welcome",
                  role: "assistant",
                  content: "Hey! I'm your video creative director. Tell me about the video you want to create — what's the story, who's the audience, and what's the vibe? I'll handle the rest.",
                  timestamp: new Date().toISOString(),
                }]);
              }}
            >
              ✦ New Video Project
            </button>

            {/* Feature Grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "16px",
              marginTop: "80px",
              textAlign: "left"
            }}>
              {[
                { icon: "🧠", title: "Gemini Script Engine", desc: "AI writes, critiques, and refines your narrative arc" },
                { icon: "🎙️", title: "ElevenLabs Voiceover", desc: "Natural narration with word-level pause detection" },
                { icon: "🎬", title: "3-Source Stock Video", desc: "Pexels + Pixabay + Coverr, ranked by CLIP vision AI" },
                { icon: "🎵", title: "Beat-Synced Editing", desc: "Cuts snap to music beats and speech pauses" },
                { icon: "🎬", title: "Remotion Render", desc: "Programmatic video with smooth transitions & motion" },
                { icon: "✂️", title: "Twick Pro Editor", desc: "Timeline-based editing when you need manual control" },
              ].map((f, i) => (
                <div key={i} className="card card-interactive" style={{ cursor: "default" }}>
                  <div style={{ fontSize: "28px", marginBottom: "12px" }}>{f.icon}</div>
                  <h4 style={{ marginBottom: "6px" }}>{f.title}</h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Chat + Brief ─── */}
        {mode === "chat" && (
          <div className="animate-in" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "24px", height: "calc(100vh - 160px)" }}>
            {/* Chat Thread */}
            <div className="card" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 style={{ fontSize: "15px" }}>Creative Brief Builder</h3>
                <span className="badge badge-accent">Conversational</span>
              </div>

              <div className="chat-messages" style={{ flex: 1 }}>
                {messages.map(msg => (
                  <div key={msg.id} className={`chat-bubble ${msg.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"}`}>
                    {msg.content}
                  </div>
                ))}
                {isTyping && (
                  <div className="chat-bubble chat-bubble-assistant" style={{ opacity: 0.6 }}>
                    <span className="animate-spin" style={{ display: "inline-block", marginRight: "8px" }}>⚙</span>
                    Thinking...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="chat-input-area">
                <input
                  className="chat-input"
                  placeholder="Describe your video idea..."
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  disabled={isTyping}
                  autoFocus
                />
                <button className="btn btn-primary" onClick={sendMessage} disabled={isTyping || !inputValue.trim()}>
                  Send
                </button>
              </div>
            </div>

            {/* Brief Panel */}
            <div className="brief-panel">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                <h3 style={{ fontSize: "15px" }}>Creative Brief</h3>
                {brief.title && (
                  <button className="btn btn-primary" style={{ fontSize: "13px", padding: "8px 16px" }} onClick={handleGenerate}>
                    ✦ Generate Video
                  </button>
                )}
              </div>

              {!brief.title ? (
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)", textAlign: "center", paddingTop: "40px" }}>
                  Start chatting to build your brief. I'll extract the key details as we talk.
                </p>
              ) : (
                <div>
                  {brief.title && (
                    <div className="brief-field">
                      <div className="brief-field-label">Title</div>
                      <div className="brief-field-value">{brief.title}</div>
                    </div>
                  )}
                  {brief.audience && (
                    <div className="brief-field">
                      <div className="brief-field-label">Audience</div>
                      <div className="brief-field-value">{brief.audience}</div>
                    </div>
                  )}
                  {brief.tone && (
                    <div className="brief-field">
                      <div className="brief-field-label">Tone</div>
                      <div className="brief-field-value">{brief.tone}</div>
                    </div>
                  )}
                  {brief.style && (
                    <div className="brief-field">
                      <div className="brief-field-label">Style</div>
                      <div className="brief-field-value">{brief.style}</div>
                    </div>
                  )}
                  {brief.duration && (
                    <div className="brief-field">
                      <div className="brief-field-label">Duration</div>
                      <div className="brief-field-value">{brief.duration}s</div>
                    </div>
                  )}
                  {brief.keyMessages && brief.keyMessages.length > 0 && (
                    <div className="brief-field">
                      <div className="brief-field-label">Key Messages</div>
                      {brief.keyMessages.map((msg, i) => (
                        <div key={i} className="brief-field-value" style={{ marginBottom: "4px" }}>
                          {msg}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Voice Selector */}
                  {availableVoices.length > 0 && (
                    <div className="brief-field" style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid var(--border-subtle)" }}>
                      <div className="brief-field-label">Narrator Voice</div>
                      <select 
                        className="input" 
                        value={brief.voiceId || ""} 
                        onChange={(e) => setBrief({ ...brief, voiceId: e.target.value })}
                        style={{ cursor: "pointer", background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
                      >
                        <option value="">Auto-select based on tone</option>
                        {availableVoices.map(v => (
                          <option key={v.voiceId} value={v.voiceId}>
                            {v.name} ({v.category})
                          </option>
                        ))}
                      </select>
                      <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>
                        Select a specific voice or let the AI choose the best match for the tone.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Generation Pipeline ─── */}
        {mode === "generating" && (
          <div className="animate-in" style={{ textAlign: "center", paddingTop: "60px" }}>
            <h2 style={{ marginBottom: "8px" }}>
              <span className="text-gradient">Generating Your Video</span>
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "48px" }}>
              8 AI agents working in concert to create your story
            </p>

            <div className="pipeline-progress" style={{ justifyContent: "center", marginBottom: "40px" }}>
              {pipelineSteps.map((step, i) => (
                <div key={step.name} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className={`pipeline-step pipeline-step-${step.status}`}>
                    {step.status === "running" && <span className="animate-spin" style={{ fontSize: "10px" }}>⚙</span>}
                    {step.status === "done" && "✓"}
                    {step.status === "failed" && "✗"}
                    {step.label}
                    {step.durationMs && (
                      <span style={{ fontSize: "10px", opacity: 0.7 }}>{Math.round(step.durationMs / 1000)}s</span>
                    )}
                  </div>
                  {i < pipelineSteps.length - 1 && <span className="pipeline-arrow">→</span>}
                </div>
              ))}
            </div>

            {error && (
              <div className="card" style={{ maxWidth: "500px", margin: "0 auto", borderColor: "var(--error)" }}>
                <p style={{ color: "var(--error)", fontSize: "14px" }}>⚠️ {error}</p>
                <button className="btn btn-secondary" onClick={() => setMode("chat")} style={{ marginTop: "16px" }}>
                  ← Back to Chat
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Review ─── */}
        {mode === "review" && (
          <div className="animate-in" style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: "24px" }}>
            {/* Video Player */}
            <div>
              <div className="video-player-container">
                {videoUrl ? (
                  <video controls src={videoUrl} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "var(--text-tertiary)",
                    fontSize: "14px"
                  }}>
                    Video will appear here after rendering completes
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                <a 
                  href={videoUrl || "#"} 
                  download={`wedire_${pipelineResult?.projectId || "video"}.mp4`}
                  className={`btn btn-primary ${!videoUrl ? "disabled" : ""}`}
                  style={{ flex: 1, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ↓ Download MP4
                </a>
                <button className="btn btn-secondary" onClick={() => setShowEditor(true)}>
                  ✎ Pro Edit Mode
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => {
                    setMode("chat");
                    setVideoUrl(null);
                    setPipelineResult(null);
                  }}
                >
                  ↻ Regenerate
                </button>
                <button className="btn btn-secondary" onClick={() => setMode("chat")}>
                  ← Edit Brief
                </button>
              </div>
            </div>

            {/* Shot List */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
                <h3 style={{ fontSize: "15px" }}>Shot List</h3>
              </div>
              <div style={{ padding: "12px", maxHeight: "500px", overflowY: "auto" }}>
                <div className="shot-list">
                  {/* Placeholder shots */}
                  {pipelineResult?.shotList?.shots?.map((shot: any, i: number) => (
                    <div key={shot.id} className="shot-item">
                      <div className="shot-index">{i + 1}</div>
                      <div className="shot-info">
                        <div className="shot-description">{shot.description}</div>
                        <div className="shot-meta">
                          {Math.round(shot.durationMs / 100) / 10}s · {shot.transition} · {shot.motion}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!pipelineResult?.shotList?.shots || pipelineResult.shotList.shots.length === 0) && (
                    <p style={{ padding: "20px", textAlign: "center", color: "var(--text-tertiary)" }}>
                      No shots generated.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Pro Editor Modal */}
      {showEditor && pipelineResult?.compositionSpec && (
        <ProEditor 
          spec={pipelineResult.compositionSpec}
          onSave={(updated) => {
            console.log("Saving updated spec:", updated);
            // In a real app, this would trigger a re-render
            setShowEditor(false);
          }}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
}
