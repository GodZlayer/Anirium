# Demand windows (local implementation, not released)

`POST /playback/window?quality=720p&position=123.5&playbackTicket=...`
requests a bounded 24-second window beginning at the preceding four-second
boundary. Only qualities discovered for the active playback are accepted.
The existing playback grant middleware protects both POST and GET.

Adding `mode=prefetch` requests only the immediate successor of the ready active
window, without cancelling it. GET with the same mode observes this separate
pending slot. A normal POST matching that successor promotes the existing job
instead of transcoding it again. At most one active and one pending window are
retained; arbitrary seeks and playback resets cancel both.

`GET /playback/window?playbackTicket=...` returns the current window's `id`,
`start`, `duration`, `quality`, `status`, `audioTracks` and, once ready,
`playlistUrl`. The media URL uses the existing authenticated `/hls/` delivery.

`duration` is the requested window size. `deliveredDuration` is the sum of
actual generated video segment durations, not a promise of 24 seconds. The
response includes `endOfEpisode` and the reference file's `episodeDuration`
(zero when unavailable). `/manifest` also includes `episodeDuration`. Requests
beyond a known episode end are rejected without replacing the current window.
At a known exact window boundary, episode duration determines the end flag;
without that metadata only a successfully completed shorter window proves EOF.
The playlist exposes only successfully generated audio tracks. No source URLs
or magnets are included in this response.

A different position or quality cancels the previous window. Its runtime
entries are removed immediately; private files are retired after its worker
exits. Playback reset and authorization cancellation also stop the worker.
Windows never overwrite the ordinary full-episode playlist prefix.

Video uses a stable eligible source with compatible-source fallback on failure.
Audio starts with the selected best candidate for each language and can recover
using already source-set-selected same-language/channel/role alternatives. All
alternatives use the preferred output format and one stable language track ID;
failed/empty producer outputs are not published. This path does not
force mixing all sources and does not perform cut correction.
Each newly requested window recalculates its shared AAC output budget from the
current observed transfer capacity. Source-language selection stays stable;
audio bitrate adaptation does not create duplicate language options. This is
measured-window adaptation, not a promise that future peer speed will remain
constant. Active-window audio options and runtime status override intentionally
stopped whole-episode background workers in the public playback manifest.

Window muxers preserve MPEG-TS timestamps with one shared positive transport
origin. The consecutive-window fixture caught and corrected an 83 ms first-
window mismatch caused by independent muxer shifts. Three consecutive real
audio/video windows now retain the same episode clock within the existing
50 ms tolerance. Delayed source audio is also tested after seeking.

## Still required before enabling in Player Pro

- The local Player now connects seek controls, window-mode quality switching,
  cancellation and status polling to this endpoint. It applies episode offsets
  to subtitles and saved progress and requests continuation on window end.
	Explicit retry preserves the requested position and pause state. Each ready
	response advances a client attachment revision so a repeated request for the
	same immutable playlist still recreates the decoder and restores position.
  These integrations still need browser playback acceptance; native HLS and
  Hls.js can expose different media origins.
- The local Player requests the immediate successor when a window is attached.
  The Service keeps the active window while preparing that successor. The
  end-triggered Player handoff still reattaches a playlist and can pause if the
  successor is not ready; this is not evidence of seamless browser playback.
- Explicit window demand cancels whole-episode background encoders without
  cancelling the playback session or shared torrent input cache. Window workers
  reserve media capacity before acquiring progressive inputs. Verify cancellation
  latency and fluency under real peer/network load before release.
- Verify installed playback end to end, including seeking near episode end,
  audio switching, stalled peers and session revocation.

The local implementation is not part of staged MSIX 2.3.12.0 and has not been
published or submitted to Microsoft. Passing Service tests is not evidence of
completed Player integration.

## Local verification (2026-10-03)

- Full Service suite with the Go race detector: passed (39.974 seconds).
- Actual Player seek handlers: verified for Service requests, local files and
  older Service manifests without window capability.
- TypeScript type checking and Core/Player media boundary guard: passed.
- Window publication snapshots have an additional concurrent-reader test.

These checks do not replace installed/browser playback acceptance, do not prove
gapless HLS handoff, and do not change Microsoft certification status.

An opt-in synthetic HLS fixture was played in Edge on 2026-10-03 using the real
window generators and the installed Hls.js bundle. Both windows exposed the
English audio track and reached `playing`; local media time restarted at zero,
and window two mapped to episode time 8. The browser exposed 8.083333 seconds
for an eight-second video window, so the Player episode clock now clamps to
delivered video duration. Screenshot:
`../.artifacts/hls-window-browser-2176503.png`.
The fixture is test-only, loopback-only and synthetic, and was shut down after
observation. It does not prove authenticated Player Pro playback or gapless
automatic handoff, and muted playback does not prove audible output.
