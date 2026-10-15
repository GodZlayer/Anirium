# Local torrent dependency patch
Source: github.com/anacrolix/torrent v1.61.0, copied from the Go module cache. Upstream license retained in torrent/LICENSE.
Reason: reader.readAt recursively retries all errors for capped storage, including canceled contexts and closed torrents. Bounded runtime cache exposed this during peer cancellation tests.
Change: check ctx.Err before reading; stop capped-storage retries when context is canceled or torrent closed. No media transport or hashing changes.
Regression scope: progressive ranges, peer replacement, eviction/redownload and full Service suite. Verification pending until logged results pass.
Additional guards: stop retries when download disabled; resource MarkComplete accepts an already published same-hash piece, including concurrent promotion of shared chunks. Resource adapter also accepts identical immutable Put during active reads. Focused cache and progressive ranges regression PASS 1.256 s; full suite rerun pending.
Verified: full Service suite using bounded peer receivers PASS 154.935 s; go vet ./... PASS. Published candidate Service 2.3.42-integration uses this local dependency.
