// Plays the host's music on the projector through YouTube's embedded player.
// The server says what should play (view.music); this file only makes it so:
//   - the question's theme while a question with one is on screen, from its start
//     time, looping back at its end time;
//   - otherwise the background link (a video or a playlist), picking up where it
//     left off when a theme interrupted it.
// Browsers refuse to play sound until someone clicks or presses a key on the page,
// so the projector shows a hint until that first click.

const YT_STATE_ENDED = 0;
const PROBLEMS = {
  2: "YouTube could not read that video link",
  5: "YouTube could not play that video in this browser",
  100: "That video is private or has been removed",
  101: "That video's owner does not allow it to play on other sites",
  150: "That video's owner does not allow it to play on other sites",
};

let apiReady = null;
function loadApi() {
  apiReady ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.append(script);
  });
  return apiReady;
}

export function startMusic({ hintEl, onProblem }) {
  let player = null;
  let wanted = null;       // the latest view.music from the server
  let loaded = null;       // { key, track, isTheme } now in the player
  let unlocked = false;    // has anyone clicked or pressed a key yet?
  const resumeAt = new Map(); // background key -> { seconds, index }, so it picks up where it left off

  const keyOf = (track) => `${track.videoId}|${track.playlistId}|${track.start}|${track.end}`;

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    apply();
  }
  document.addEventListener("pointerdown", unlock);
  document.addEventListener("keydown", unlock);

  async function ensurePlayer() {
    if (player) return player;
    await loadApi();
    if (player) return player;
    await new Promise((resolve) => {
      player = new window.YT.Player("yt-player", {
        width: 200, height: 113,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: resolve,
          onStateChange: (event) => {
            // A single video loops: at its end (or the end time), start it over.
            if (event.data === YT_STATE_ENDED && loaded && !loaded.track.playlistId) load(loaded.track, loaded.track.start);
          },
          onError: (event) => onProblem?.(PROBLEMS[event.data] ?? `YouTube error ${event.data}`),
        },
      });
    });
    return player;
  }

  function load(track, startSeconds, index = 0) {
    if (track.videoId) {
      player.loadVideoById({ videoId: track.videoId, startSeconds, ...(track.end ? { endSeconds: track.end } : {}) });
    } else {
      player.loadPlaylist({ list: track.playlistId, listType: "playlist", index, startSeconds });
      player.setLoop(true);
    }
  }

  async function apply() {
    const music = wanted;
    const track = music?.playing ? (music.theme ?? music.background) : null;
    hintEl.hidden = !(track && !unlocked);
    if (!track) {
      if (player?.pauseVideo) player.pauseVideo();
      return;
    }
    if (!unlocked) return;
    await ensurePlayer();
    if (wanted !== music) return; // a newer update arrived while the player was loading

    const key = keyOf(track);
    if (loaded?.key !== key) {
      // Leaving the background for a theme: remember where it was.
      if (loaded && !loaded.isTheme) {
        resumeAt.set(loaded.key, { seconds: player.getCurrentTime(), index: player.getPlaylistIndex?.() ?? 0 });
      }
      const isTheme = track === music.theme;
      const resume = isTheme ? null : resumeAt.get(key);
      load(track, resume?.seconds ?? track.start, resume?.index ?? 0);
      loaded = { key, track, isTheme };
    }
    player.setVolume(music.volume);
    player.unMute();
    player.playVideo();
  }

  return {
    update(music) {
      wanted = music;
      apply();
    },
  };
}
