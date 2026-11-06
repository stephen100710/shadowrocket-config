// Weibo feed ad filter for Shadowrocket (http-response script) — v9
// v9 fix (2026-11-06): Discover-page carousel ad survived v8. It is the
// 4-slide carousel under Hot Search on search/finder: its 4 pictures are
// on kadmimage.biz.weibo.com (already REJECTed, hence the grey empty box
// with an '广告' badge and 4 dots), but the slides sit in a NESTED items
// list (payload.items[0].items or header.data.items) that filterArray
// never recursed into, and hasAdMedia deliberately skips nested items
// arrays. v9 recurses into item.items / item.data.items with the same
// rule as card_group (filter members one by one; drop the container only
// if every member is an ad), and also filters header.data.items and
// deletes header.insert_data (finder ad-insert slot).
// v8 fix (2026-11-06): detail-page banner ad (e.g. iCloud+) survived v7.
// It is a horizontal banner card, not a mblog post: no mblogtype/is_ad/
// promotion marker, and its picture is on normal wx*.sinaimg.cn, so the
// ad-media fallback missed it. Community-confirmed card types for it:
//   - card_type 118 = horizontal banner ad image (横版广告图片)
//   - card_type 247 = horizontal video ad (横版视频广告)
// Also handled: content_auth_title === '广告', and container_detail's
// pageHeader.data.items, which the old container-only logic never saw.
// v7 fix (2026-11-06): v6 broke search/topic pages. Root cause: filterArray
// called isAdItem() on a group card BEFORE filtering its card_group, and
// hasAdMedia() JSON-stringified the whole card including card_group, so a
// group containing 1 ad post + N normal posts was deleted as a whole.
// Search groups many posts per card, so the whole page emptied and Weibo
// showed 'network unavailable'; feed cards are mostly single-post, which
// is why the feed survived. v7 filters card_group members first and only
// checks the container's own direct fields afterwards; hasAdMedia() no
// longer stringifies card_group or nested container arrays.
// Targets:
//   https://api.weibo.cn/2/statuses/container_timeline_hot  (hot feed)
//   https://api.weibo.cn/2/video/flow_stream               (video tab feed)
//   https://api.weibo.cn/2/statuses/container_detail_comment (comment list)
//   https://api.weibo.cn/2/comments/build_comments          (comment list, alt)
//   https://api.weibo.cn/2/statuses/container_detail       (post detail page)
//   https://api.weibo.cn/2/searchall                     (search results)
//   https://api.weibo.cn/2/search/container_timeline      (search results)
//   https://api.weibo.cn/2/search/finder                  (search landing)
// Removes in-feed / in-list / in-comment / in-search ad items.
// Fail-safe: on any unexpected structure or error the original body
// is returned untouched, so the feed can never break because of this
// script.
//
// Ad markers (checked on the item itself and on its mblog/video/data
// sub-object). Community-confirmed for the domestic app:
//   - mblogtype === 1 (ad) vs 0 (normal post)
//   - mblogtypename === "广告" / "廣告" / "热推" / "熱推"
//   - is_ad / is_ad_card / ad_marked (truthy)
//   - promotion object (non-empty), promotion.type === "ad"
//   - ad / ad_info payload objects (non-empty)
// Fallback (2026-11-06, from the user's log): an item whose JSON
// references a Weibo ad-media host is an ad even if it carries no
// marker above — normal posts use weibocdn.com / sinaimg.cn, never
// these:
//   - kadmimage.biz.weibo.com  (video-ad poster / KA ad images; the
//     host is already REJECTed, which is why those video ads show as
//     non-playing slots instead of playing)
//   - ad.us.sinaimg.cn        (ad image CDN, also REJECTed)
// Normal posts have none of these. Card layout fields are NOT used as
// ad signals in general — except card_type 118/247, which by definition
// are banner-ad cards (see v8 note at top).
//
// Response shapes handled (the container endpoints vary by version):
//   - cards / data.cards            (card_group items with mblog)
//   - items / data.items            (array, or { data: [...] } with mblogtype)
//   - statuses / data.statuses      (plain post objects)
//   - comments / data.comments      (comment list; ad items incl. video ads)
//   - channelInfo.channels[].payload (search landing: items/cards inside)

var body = $response.body;

var AD_TYPENAMES = { "广告": true, "廣告": true, "热推": true, "熱推": true };
// Ad-media hosts that never appear in a normal post.
var AD_MEDIA_HOSTS = ["kadmimage.biz.weibo.com", "ad.us.sinaimg.cn"];

function hasAdMarker(obj) {
  if (!obj || typeof obj !== 'object') return false;
  // Horizontal banner / video ad cards (detail page, feed, search):
  // card_type 118 = banner ad image, 247 = banner video ad.
  if (obj.card_type === 118 || obj.card_type === "118" || obj.card_type === 247 || obj.card_type === "247") return true;
  if (obj.content_auth_title === "广告" || obj.content_auth_title === "廣告") return true;
  if (obj.content_auth_info && (obj.content_auth_info.content_auth_title === "广告" || obj.content_auth_info.content_auth_title === "廣告")) return true;
  if (obj.mblogtype === 1 || obj.mblogtype === "1") return true;
  if (obj.mblogtypename && AD_TYPENAMES[obj.mblogtypename]) return true;
  if (obj.is_ad === true || obj.is_ad === 1) return true;
  if (obj.is_ad_card === true || obj.is_ad_card === 1) return true;
  if (obj.ad_marked === true || obj.ad_marked === 1) return true;
  if (obj.promotion && typeof obj.promotion === 'object' && Object.keys(obj.promotion).length > 0) return true;
  if (obj.ad === true || obj.ad === 1) return true;
  if (obj.ad && typeof obj.ad === 'object' && Object.keys(obj.ad).length > 0) return true;
  if (obj.ad_info && typeof obj.ad_info === 'object' && Object.keys(obj.ad_info).length > 0) return true;
  return false;
}

function hasAdMedia(item) {
  // Fallback: the item references an ad-media host in its OWN JSON.
  // Deliberately excludes card_group and nested container arrays
  // (data.cards/items/statuses/comments): those hold other posts, and
  // stringifying them would mark a whole group as ad because ONE
  // member inside it is an ad. Single posts are unaffected - their
  // own mblog/pic/page_info fields are still stringified.
  var copy = {};
  var k;
  for (k in item) { if (k === 'card_group') continue; copy[k] = item[k]; }
  if (copy.data && typeof copy.data === 'object') {
    var d = {};
    for (k in copy.data) {
      if (k === 'cards' || k === 'items' || k === 'statuses' || k === 'comments' || k === 'card_group') continue;
      d[k] = copy.data[k];
    }
    copy.data = d;
  }
  var s;
  try { s = JSON.stringify(copy); } catch (e) { return false; }
  if (!s) return false;
  for (var i = 0; i < AD_MEDIA_HOSTS.length; i++) {
    if (s.indexOf(AD_MEDIA_HOSTS[i]) !== -1) return true;
  }
  return false;
}

function isAdItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (hasAdMarker(item)) return true;
  if (hasAdMarker(item.mblog)) return true;
  if (hasAdMarker(item.video)) return true;
  if (hasAdMarker(item.data)) return true;
  if (item.data && hasAdMarker(item.data.mblog)) return true;
  if (item.data && hasAdMarker(item.data.video)) return true;
  if (hasAdMarker(item.comment)) return true;
  if (hasAdMedia(item)) return true;
  return false;
}

function filterArray(arr) {
  var removed = 0, kept = [];
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    if (!it || typeof it !== 'object') { kept.push(it); continue; }
    if (Array.isArray(it.card_group)) {
      // Group card (search / topic pages group many posts per card):
      // filter the members first, one by one. Only then look at the
      // container itself - and only its own direct markers, never the
      // members inside it. Deleting the whole card here is what emptied
      // search pages in v6.
      var sub = filterArray(it.card_group);
      removed += sub.removed;
      if (sub.kept.length === 0 && sub.removed > 0) { removed++; continue; }
      it.card_group = sub.kept;
      if (hasAdMarker(it)) { removed++; continue; }
      kept.push(it);
      continue;
    }
    if (it.data && Array.isArray(it.data.card_group)) {
      // New-structure group card (category group/card, members under
      // data.card_group): same rule as the old item-level card_group —
      // filter members first, then judge the container on its own fields.
      var sub2 = filterArray(it.data.card_group);
      removed += sub2.removed;
      if (sub2.kept.length === 0 && sub2.removed > 0) { removed++; continue; }
      it.data.card_group = sub2.kept;
      if (isAdItem(it)) { removed++; continue; }
      kept.push(it);
      continue;
    }
    // Nested sub-lists (finder payload.items[0].items, header items,
    // carousel slides under item.items / item.data.items): same rule as
    // card_group — filter members one by one, drop the container only
    // if every member is an ad. Never judge the container by its members.
    var nested = [it.items, it.data && it.data.items];
    for (var n = 0; n < nested.length; n++) {
      var sub3 = null, set3 = null;
      if (Array.isArray(nested[n])) {
        sub3 = filterArray(nested[n]);
        set3 = (function (arr) { return function (v) { arr.length = 0; for (var q = 0; q < v.length; q++) arr.push(v[q]); }; })(nested[n]);
      } else if (nested[n] && Array.isArray(nested[n].data)) {
        sub3 = filterArray(nested[n].data);
        set3 = (function (wrap) { return function (v) { wrap.data = v; }; })(nested[n]);
      }
      if (sub3) {
        removed += sub3.removed;
        if (sub3.kept.length === 0 && sub3.removed > 0) { removed++; it = null; break; }
        set3(sub3.kept);
      }
    }
    if (it === null) continue;
    if (isAdItem(it)) { removed++; continue; }
    kept.push(it);
  }
  return { kept: kept, removed: removed };
}

// Filter one container key on obj: handles both a plain array and
// an object wrapping a .data array (e.g. items.data).
function filterContainer(obj, key) {
  if (!obj || typeof obj !== 'object') return { found: false, removed: 0 };
  var arr = null, set = null;
  if (Array.isArray(obj[key])) {
    arr = obj[key];
    set = function (v) { obj[key] = v; };
  } else if (obj[key] && Array.isArray(obj[key].data)) {
    arr = obj[key].data;
    set = function (v) { obj[key].data = v; };
  }
  if (!arr) return { found: false, removed: 0 };
  var r = filterArray(arr);
  set(r.kept);
  return { found: true, removed: r.removed, total: arr.length, kept: r.kept.length };
}

// Filter every known container key on one object; returns removed count
// and a shape summary, and records first-item keys for diagnostics.
function filterObjectContainers(obj, state) {
  if (!obj || typeof obj !== 'object') return;
  var keys = ["cards", "items", "statuses", "comments"];
  for (var k = 0; k < keys.length; k++) {
    var r = filterContainer(obj, keys[k]);
    if (r.found) {
      state.removed += r.removed;
      state.shapes.push(keys[k] + ":" + r.total + "->" + r.kept);
      if (!state.firstItemKeys) {
        var probe = null;
        var src = obj[keys[k]];
        if (Array.isArray(src) && src.length > 0) probe = src[0];
        else if (src && Array.isArray(src.data) && src.data.length > 0) probe = src.data[0];
        if (probe) {
          state.firstItemKeys = "first item keys: " + Object.keys(probe).join(",");
          if (probe.mblog) state.firstItemKeys += " | mblog keys: " + Object.keys(probe.mblog).join(",");
        }
      }
    }
  }
}

try {
  var data = JSON.parse(body);
  var state = { removed: 0, shapes: [], firstItemKeys: "" };
  filterObjectContainers(data, state);
  if (data && data.data && typeof data.data === 'object') {
    filterObjectContainers(data.data, state);
  }
  // Search landing (search/finder): results live under
  // channelInfo.channels[].payload (each payload has items/cards).
  var ci = (data && data.channelInfo) || (data && data.data && data.data.channelInfo);
  if (ci && Array.isArray(ci.channels)) {
    for (var i = 0; i < ci.channels.length; i++) {
      var payload = ci.channels[i] && ci.channels[i].payload;
      if (payload) filterObjectContainers(payload, state);
    }
  }
  // Detail page (container_detail): banner cards can also live in
  // pageHeader.data.items, which the container logic above never sees.
  // Filter them with the same ad test; normal header items have no ad
  // marker and are kept.
  var ph = (data && data.pageHeader && data.pageHeader.data) || (data && data.data && data.data.pageHeader && data.data.pageHeader.data);
  if (ph && Array.isArray(ph.items)) {
    var rph = filterArray(ph.items);
    if (rph.removed > 0 || ph.items.length > 0) {
      ph.items = rph.kept;
      state.removed += rph.removed;
      state.shapes.push("pageHeader.items:" + (rph.kept.length + rph.removed) + "->" + rph.kept.length);
    }
  }
  // Discover landing (search/finder): carousel / hot-search modules can
  // also live in header.data.items, which the container logic never sees.
  // header.insert_data is the finder's ad-insert slot — drop it outright.
  var hd = (data && data.header && data.header.data) || (data && data.data && data.data.header && data.data.header.data);
  if (hd) {
    if (hd.insert_data) { delete hd.insert_data; state.removed++; }
    if (Array.isArray(hd.items)) {
      var rh = filterArray(hd.items);
      if (rh.removed > 0 || hd.items.length > 0) {
        hd.items = rh.kept;
        state.removed += rh.removed;
        state.shapes.push("header.items:" + (rh.kept.length + rh.removed) + "->" + rh.kept.length);
      }
    }
  }
  if (state.shapes.length === 0) {
    console.log('[weibo-feed-filter] no known container found, body unchanged');
    $done({ body: body });
  } else {
    console.log('[weibo-feed-filter] shapes [' + state.shapes.join(', ') + '] removed ' + state.removed + ' | ' + state.firstItemKeys);
    $done({ body: JSON.stringify(data) });
  }
} catch (e) {
  $done({ body: body });
}
