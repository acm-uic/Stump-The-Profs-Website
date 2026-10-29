// Turns a YouTube link into what the projector's player needs: a video id or a
// playlist id, and where to start and stop. Links are checked here, on the server,
// so a typo in questions.json is caught at upload time, not halfway through the night.
//
// Accepted links (anything else is refused):
//   youtube.com/watch?v=ID   youtu.be/ID   youtube.com/embed/ID   youtube.com/shorts/ID
//   youtube.com/live/ID   music.youtube.com/watch?v=ID   youtube.com/playlist?list=ID
// Times: t= or start= to begin (90, 90s, 1m30s, 1h2m3s or 1:30) and end= to stop.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com"];

// "90" -> 90, "1m30s" -> 90, "1:30" -> 90, "1:02:03" -> 3723. Anything else -> null.
export function parseSeconds(text) {
  if (text == null || text === "") return null;
  const value = String(text).trim();
  if (/^\d+s?$/.test(value)) return Number.parseInt(value, 10);
  const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (units && (units[1] || units[2] || units[3])) {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
  }
  if (/^\d+(?::\d{1,2}){1,2}$/.test(value)) {
    return value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  }
  return null;
}

// Returns { videoId, playlistId, start, end } (ids may be null, times default to 0 and
// null), or null when the link is not a YouTube link this app can play.
export function parseYouTube(link) {
  if (typeof link !== "string" || link.trim() === "") return null;
  let url;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(url.protocol) || !HOSTS.includes(url.hostname)) return null;

  let videoId = null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname === "youtu.be") videoId = parts[0] ?? null;
  else if (parts[0] === "watch") videoId = url.searchParams.get("v");
  else if (["embed", "shorts", "live", "v"].includes(parts[0])) videoId = parts[1] ?? null;

  const playlistId = url.searchParams.get("list");
  if (videoId !== null && !VIDEO_ID.test(videoId)) return null;
  if (playlistId !== null && !PLAYLIST_ID.test(playlistId)) return null;
  if (videoId === null && playlistId === null) return null;

  // youtu.be/ID#t=90 puts the time after the #.
  const hashTime = new URLSearchParams(url.hash.slice(1)).get("t");
  const startText = url.searchParams.get("t") ?? url.searchParams.get("start") ?? hashTime;
  const start = startText == null ? 0 : parseSeconds(startText);
  const endText = url.searchParams.get("end");
  const end = endText == null ? null : parseSeconds(endText);
  if (start === null || (endText != null && end === null)) return null;
  if (end !== null && end <= start) return null;

  return { videoId, playlistId, start, end };
}
