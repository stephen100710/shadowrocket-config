// X (Twitter) home-timeline ad filter for Shadowrocket (http-response script) — v1
// v1 (2026-11-08): first version. The user's 2026-11-08 logs proved:
//   - In-feed promoted tweets ride inside the same HomeTimeline GraphQL
//     response as normal posts, so a domain REJECT cannot remove them:
//     ads-api.x.com is already REJECTed (8x per timeline load) and the
//     SIMBA Telecom promoted tweet still rendered; api.x.com is the feed
//     API itself and must never be whole-domain REJECTed.
//   - MITM on api.x.com works (v15 log 14:18:11-14:18:21 shows 9 full
//     https://api.x.com/graphql/... paths), so X does not pin api.x.com.
// Targets (pattern in the .conf):
//   https://api.x.com/graphql/<hash>/HomeTimeline
//   https://api.x.com/graphql/<hash>/HomeLatestTimeline
// Removes promoted-tweet entries from the timeline. Fail-safe: on any
// unexpected structure or error the original body is returned untouched,
// so the timeline can never break because of this script.
//
// Ad markers (X GraphQL URT timeline, community-confirmed):
//   - entryId starts with "promoted-tweet-" (the promoted entry id)
//   - the tweet result carries a "promotedMetadata" object
//     (result.__typename "Tweet", or "TweetWithVisibilityResults"
//     wrapping .tweet — both shapes checked)
// Filter rule (same lesson as the Weibo v7 fix): entries inside one
// TimelineAddEntries instruction are judged ONE BY ONE and only the ad
// entry is dropped; cursors ("cursor-top-"/"cursor-bottom-") and normal
// posts are always kept, and an instruction is never deleted as a whole
// (it keeps its remaining entries, possibly an empty array).

var body = $response.body;

function tweetResultOf(entry) {
  try {
    var ic = entry && entry.content && entry.content.itemContent;
    if (!ic) return null;
    var tr = ic.tweet_results;
    if (!tr || !tr.result) return null;
    var r = tr.result;
    if (r.__typename === 'TweetWithVisibilityResults' && r.tweet) return r.tweet;
    return r;
  } catch (e) {
    return null;
  }
}

function hasPromotedMetadata(obj) {
  if (!obj || typeof obj !== 'object') return false;
  var pm = obj.promotedMetadata;
  return !!pm && typeof pm === 'object';
}

function isAdEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  var id = entry.entryId || '';
  // Cursors are never ads; guard them explicitly.
  if (id.indexOf('cursor-') === 0) return false;
  if (id.indexOf('promoted-tweet-') === 0 || id.indexOf('promoted-') === 0) return true;
  var ic = entry && entry.content && entry.content.itemContent;
  // A module entry is a CONTAINER (topic / who-to-follow rail): never
  // drop it as a whole here — a promoted item inside it is removed by
  // filterEntries' module handling. Without this guard, the stringify
  // fallback below would see the nested promotedMetadata and delete the
  // whole module including its normal items (the Weibo v6 group bug).
  if (ic && ic.itemType === 'TimelineTimelineModule') return false;
  // Direct check on the tweet result (covers Tweet and
  // TweetWithVisibilityResults shapes).
  if (hasPromotedMetadata(tweetResultOf(entry))) return true;
  // Fallback for shape drift: the promotedMetadata key never appears
  // in a normal tweet. Only this single entry is stringified, never
  // a whole group, so a normal post grouped with an ad is safe.
  try {
    if (JSON.stringify(entry).indexOf('"promotedMetadata"') !== -1) return true;
  } catch (e) {}
  return false;
}

function filterModuleItems(items) {
  // TimelineTimelineModule items (e.g. topic / who-to-follow rails):
  // judge each item on its own; drop only the promoted one.
  var kept = [];
  var removed = 0;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var fake = { entryId: (it && it.entryId) || '', content: it };
    // Module items carry their content under .item with itemContent.
    if (it && it.item && it.item.itemContent) {
      fake = { entryId: (it && it.entryId) || '', content: { itemContent: it.item.itemContent } };
    }
    if (isAdEntry(fake)) { removed++; continue; }
    kept.push(it);
  }
  return { kept: kept, removed: removed };
}

function filterEntries(entries) {
  var kept = [];
  var removed = 0;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (isAdEntry(entry)) { removed++; continue; }
    // A module entry may hide a promoted item inside its items list.
    try {
      var ic = entry && entry.content && entry.content.itemContent;
      if (ic && ic.itemType === 'TimelineTimelineModule' && Array.isArray(ic.items)) {
        var r = filterModuleItems(ic.items);
        if (r.removed > 0) {
          ic.items = r.kept;
          removed += r.removed;
        }
      }
    } catch (e) {}
    kept.push(entry);
  }
  return { kept: kept, removed: removed };
}

try {
  var data = JSON.parse(body);
  var removed = 0;
  var shapes = [];
  var urt = data && data.data && data.data.home && data.data.home.home_timeline_urt;
  if (urt && Array.isArray(urt.instructions)) {
    for (var i = 0; i < urt.instructions.length; i++) {
      var ins = urt.instructions[i];
      if (!ins || ins.type !== 'TimelineAddEntries' || !Array.isArray(ins.entries)) continue;
      var before = ins.entries.length;
      var r = filterEntries(ins.entries);
      if (r.removed > 0) {
        ins.entries = r.kept;
        removed += r.removed;
        shapes.push('TimelineAddEntries:' + before + '->' + r.kept.length);
      }
    }
  }
  if (shapes.length === 0) {
    console.log('[x-feed-filter] no promoted entries found, body unchanged');
    $done({ body: body });
  } else {
    console.log('[x-feed-filter] shapes [' + shapes.join(', ') + '] removed ' + removed);
    $done({ body: JSON.stringify(data) });
  }
} catch (e) {
  $done({ body: body });
}
