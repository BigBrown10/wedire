import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

/**
 * Downloads a file from a URL to a local path using streaming.
 * Returns the absolute path to the downloaded file.
 */
export async function downloadFile(url: string, targetPath: string, maxRedirects = 5): Promise<string> {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (maxRedirects < 0) {
    throw new Error(`Too many redirects for ${url}`);
  }

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        const location = response.headers.location;
        if (location) {
          // Resolve relative redirect URL if necessary
          const redirectUrl = new URL(location, url).toString();
          resolve(downloadFile(redirectUrl, targetPath, maxRedirects - 1));
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      const fileStream = fs.createWriteStream(targetPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve(targetPath);
      });

      fileStream.on('error', (err) => {
        fs.unlink(targetPath, () => {}); // Delete partial file
        reject(err);
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    // Set a 60 second timeout
    request.setTimeout(60000, () => {
      request.destroy();
      reject(new Error(`Download timeout for ${url}`));
    });
  });
}
