// ─── FFmpeg Post-Processing ───
// Mixes the final audio track (VO + Music) and applies compression/limiting.
// Remotion renders the visual track + basic audio, but for a polished result,
// we do a final FFmpeg pass to ensure broadcast-quality audio levels.

import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";

const ffmpegStatic = require("ffmpeg-static");
let ffmpegPath = typeof ffmpegStatic === "string" ? ffmpegStatic : path.join(process.cwd(), "node_modules", "ffmpeg-static", os.platform() === "win32" ? "ffmpeg.exe" : "ffmpeg");

// Robust path normalization for Windows/OneDrive environments
// If path starts with \ROOT or is missing the drive/user prefix, try to fix it
if (ffmpegPath.startsWith('\\ROOT\\')) {
  ffmpegPath = ffmpegPath.replace('\\ROOT\\', 'C:\\Users\\edogu\\'); // Targeted fix for this specific machine
} else if (ffmpegPath.startsWith('C:\\OneDrive\\')) {
  ffmpegPath = ffmpegPath.replace('C:\\OneDrive\\', 'C:\\Users\\edogu\\OneDrive\\');
}

if (!path.isAbsolute(ffmpegPath)) {
  ffmpegPath = path.resolve(process.cwd(), ffmpegPath);
}

console.log(`[FFmpegPost] Resolved ffmpeg at: ${ffmpegPath}`);
ffmpeg.setFfmpegPath(ffmpegPath);

export interface PostProcessOptions {
  inputVideoPath: string;
  outputVideoPath: string;
  audioTracks: {
    type: 'voiceover' | 'music' | 'sfx';
    src: string;
    startMs: number;
    volume: number;
  }[];
  durationMs: number;
}

export async function processAudioMix(options: PostProcessOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    // If no external audio tracks, just return the input
    if (options.audioTracks.length === 0) {
      fs.copyFileSync(options.inputVideoPath, options.outputVideoPath);
      resolve(options.outputVideoPath);
      return;
    }

    const command = ffmpeg();
    
    // Input 0: The Remotion-rendered video (mute its original audio)
    command.input(options.inputVideoPath);

    let filterComplex = "";
    let amixInputs = "";

    // Add each audio track as an input
    let currentInputIndex = 1;
    options.audioTracks.forEach((track) => {
      // Check if it's a URL or an absolute path
      const isUrl = track.src.startsWith('http://') || track.src.startsWith('https://');
      let srcPath = track.src;

      if (!isUrl && !path.isAbsolute(srcPath)) {
        if (srcPath.startsWith('/')) {
          srcPath = path.join(process.cwd(), 'public', srcPath);
        } else {
          srcPath = path.join(process.cwd(), srcPath);
        }
      }
      
      if (!isUrl && !fs.existsSync(srcPath)) {
        console.warn(`[FFmpegPost] Skipping missing audio file: ${srcPath}`);
        return;
      }

      command.input(srcPath);

      const delayMs = track.startMs;
      const volume = track.type === 'music' ? Math.max(track.volume, 0.4) : track.volume;
      
      if (track.type === 'voiceover') {
        filterComplex += `[${currentInputIndex}:a]adelay=${delayMs}|${delayMs},volume=${volume},acompressor=threshold=-10dB:ratio=2[a${currentInputIndex}];`;
      } else if (track.type === 'music') {
        filterComplex += `[${currentInputIndex}:a]adelay=${delayMs}|${delayMs},volume=${volume}[a${currentInputIndex}];`;
      } else {
        // SFX: Pure pass-through with volume
        filterComplex += `[${currentInputIndex}:a]adelay=${delayMs}|${delayMs},volume=${volume}[a${currentInputIndex}];`;
      }
      amixInputs += `[a${currentInputIndex}]`;
      currentInputIndex++;
    });

    const activeTrackCount = currentInputIndex - 1;

    // Mix all audio tracks. amix=normalize=0 prevents volume dropping when multiple tracks exist.
    filterComplex += `${amixInputs}amix=inputs=${activeTrackCount}:duration=longest:normalize=0[amixed];`;
    // Final master compression and limiting to ensure 'loud' and 'premium' sound
    filterComplex += `[amixed]acompressor=threshold=-12dB:ratio=4:attack=5:release=50:makeup=6dB,alimiter=limit=0.95:attack=5:release=50[aout]`;

    command
      .complexFilter(filterComplex)
      .outputOptions([
        "-map 0:v",
        "-map [aout]",
        "-c:v copy",
        "-c:a aac",
        "-b:a 256k",
        `-t ${options.durationMs / 1000}`,
      ])
      .save(options.outputVideoPath)
      .on("end", () => {
        resolve(options.outputVideoPath);
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

export async function extractKeyframes(videoPath: string, outputDir: string, count: number = 5): Promise<string[]> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        count,
        folder: outputDir,
        filename: 'frame-%i.jpg',
        size: '1280x720'
      })
      .on('end', () => {
        const frames = Array.from({ length: count }, (_, i) => path.join(outputDir, `frame-${i + 1}.jpg`));
        resolve(frames);
      })
      .on('error', (err) => reject(err));
  });
}
