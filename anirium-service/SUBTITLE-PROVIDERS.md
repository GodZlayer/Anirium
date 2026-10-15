# Subtitle provider protocol

The local Service alone consumes this protocol. Configure the independent
server in `ANIRIUM_PROVIDER_SERVERS`; its ID must also be present in the
account's authorized addon IDs returned by Core session validation.

The remote manifest must declare `subtitle.search` and
`endpoints.subtitleSearch`. The Service sends GET parameters `title`, `season`
and `ep`. The JSON response is:

```json
{"subtitles":[{"language":"por","title":"Portuguese","format":"srt","url":"/files/episode.srt"}]}
```

Supported remote formats are SRT, ASS and WebVTT, converted by FFmpeg to
WebVTT before delivery. ASS styling and positioning may not survive WebVTT
conversion; this does not implement an ASS renderer in the Player.
Relative file URLs resolve against
the manifest URL. Search and file URLs must remain on the manifest's origin;
redirects are rejected. This lets provider servers proxy their own upstream
sources without exposing upstream endpoints to the Player. The Player receives
only an opaque track ID; files are fetched through the authenticated Service
subtitle endpoint. Other existing addon protocols require a server adapter.
