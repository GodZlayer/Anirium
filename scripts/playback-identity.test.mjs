import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackPreparationRequest, playbackIdentityMatches, adjacentCatalogEpisode } from '../resources/js/addons/player-pro/playbackIdentity.ts';

const workId = '59eff475-b7a0-4657-bf8f-c367fb1c3f8c';
const episodeId = '25dce320-0f9e-4269-8c43-3005708adaf1';
const otherId = '49081039-8396-4ffc-bd90-59ae50bcf626';
test('canonical preparation sends IDs only and rejects malformed identity', () => {
  assert.deepEqual(playbackPreparationRequest({workId, episodeId}, {title:'spoof',malId:1,episode:90}), {workId,episodeId});
  assert.equal(playbackPreparationRequest({workId:'invalid'}, {malId:1}), null);
  assert.deepEqual(playbackPreparationRequest({workId}, {}), {workId});
});
test('response must belong to the same work and episode', () => {
  assert.equal(playbackIdentityMatches({workId,episodeId}, {workId,episodeId}), true);
  assert.equal(playbackIdentityMatches({workId,episodeId}, {workId,episodeId:otherId}), false);
  assert.equal(playbackIdentityMatches({workId,episodeId}, undefined), false);
  assert.equal(playbackIdentityMatches({workId}, {workId,episodeId}), false);
});
test('navigation follows known episode identities across numbering gaps', () => {
  const rows=[{id:otherId,number:8},{id:episodeId,number:1}];
  assert.equal(adjacentCatalogEpisode(rows,episodeId,1)?.id,otherId);
  assert.equal(adjacentCatalogEpisode(rows,otherId,1),null);
  assert.equal(adjacentCatalogEpisode(rows,workId,1),null);
});
