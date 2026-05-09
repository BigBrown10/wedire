"use client";
// Updated for 2026 Golden Standard

import React, { useEffect, useState } from "react";
// Import Twick components (assuming standard export pattern for @twick/video-editor)
// Note: Depending on Twick's exact API, this may need adjustment
import VideoEditor, { useEditorManager } from "@twick/video-editor";
import { LivePlayerProvider } from "@twick/live-player";
import { TimelineProvider } from "@twick/timeline";
import "@twick/video-editor/dist/video-editor.css"; 
import type { CompositionSpec } from "@/lib/types";

export interface ProEditorProps {
  spec: CompositionSpec;
  onSave: (updatedSpec: CompositionSpec) => void;
  onClose: () => void;
}

export const ProEditor: React.FC<ProEditorProps> = (props) => {
  return (
    <LivePlayerProvider>
      <TimelineProvider initialData={{ timeline: [], version: 0 }}>
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--bg-primary)", display: "flex", flexDirection: "column" }}>
          <ProEditorInner {...props} />
        </div>
      </TimelineProvider>
    </LivePlayerProvider>
  );
};

const ProEditorInner: React.FC<ProEditorProps> = ({ spec, onSave, onClose }) => {
  const { loadProject, project } = useEditorManager();

  // Initialize Twick data model from our CompositionSpec
  useEffect(() => {
    // ... same as before
    const tracks: any[] = [];
    
    // 1. Video Track
    const videoItems = spec.shots.map((shot, i) => ({
      id: shot.shotId,
      source: shot.videoSrc,
      startAt: shot.startFrame / spec.fps,
      duration: shot.durationInFrames / spec.fps,
      sourceStart: shot.videoStartOffsetMs / 1000,
    }));

    tracks.push({
      id: "video-track-1",
      type: "video",
      items: videoItems
    });

    // 2. Audio Tracks (VO + Music)
    spec.audioTracks.forEach((audio, i) => {
      tracks.push({
        id: `audio-track-${i}`,
        type: "audio",
        items: [{
          id: `audio-item-${i}`,
          source: audio.src,
          startAt: audio.startFrame / spec.fps,
          volume: audio.volume,
          duration: 30, // Fallback duration
        }]
      });
    });

    // 3. Text Overlay Track
    const textItems = spec.shots.filter(s => s.overlay).map((shot) => ({
      id: `text-${shot.shotId}`,
      text: shot.overlay!.text,
      startAt: shot.overlay!.fadeInFrame / spec.fps,
      duration: (shot.overlay!.fadeOutFrame - shot.overlay!.fadeInFrame) / spec.fps,
      style: {
        fontSize: shot.overlay!.style === "stat" ? 96 : 48,
        color: "#ffffff"
      }
    }));
    
    if (textItems.length > 0) {
      tracks.push({
        id: "text-track-1",
        type: "text",
        items: textItems
      });
    }

    loadProject({
      id: spec.id,
      name: "Wedire Project",
      fps: spec.fps,
      width: spec.width,
      height: spec.height,
      duration: spec.durationInFrames / spec.fps,
      tracks
    });
  }, [spec, loadProject]);

  const handleSave = () => {
    onSave(spec); 
  };

  return (
    <>
      {/* Editor Header */}
      <div style={{ height: "60px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <h2 style={{ fontSize: "18px", margin: 0 }}>Pro Edit Mode</h2>
        <div style={{ display: "flex", gap: "12px" }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save & Re-Render</button>
        </div>
      </div>

      {/* Editor Body */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <VideoEditor 
          editorConfig={{
            videoProps: {
              width: spec.width,
              height: spec.height,
              backgroundColor: "#000000"
            },
            fps: spec.fps,
            canvasMode: true
          }}
          defaultPlayControls={true}
        />
      </div>
    </>
  );
};
