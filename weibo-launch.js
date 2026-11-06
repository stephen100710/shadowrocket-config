// Weibo splash ad cache clear for Shadowrocket (http-response script)
// Targets:
//   https://sdkapp.uve.weibo.com/interface/sdk/sdkad.php
//   https://wbapp.uve.weibo.com/wbapplua/wbpullad.lua
//   https://bootpreload.uve.weibo.com/v[12]/ad/preload
//
// Why a script (and not a REJECT): the app caches the splash ad
// (cached_ad) on the phone. Blocking these endpoints with a REJECT
// leaves the stale cache in place, so the splash keeps showing on
// every launch. Letting them through but returning EMPTY ad data
// makes the app overwrite its cache with "no ads", and the splash
// stops. Fail-safe: on any parse/structure error the original body
// is returned untouched.

var url = $request.url;
var body = $response.body;

function emptyAds(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj.ads)) obj.ads = [];
  if (obj.cached_ad && Array.isArray(obj.cached_ad.ads)) obj.cached_ad.ads = [];
  if (obj.data && Array.isArray(obj.data.ads)) obj.data.ads = [];
  if (obj.show_push_splash_ad !== undefined) obj.show_push_splash_ad = false;
  if (obj.background_delay_display_time !== undefined) obj.background_delay_display_time = 60 * 60 * 24 * 365;
  return obj;
}

try {
  if (url.indexOf("/interface/sdk/sdkad.php") !== -1) {
    // Body may carry trailing text (e.g. "OK") after the JSON; keep it.
    var start = body.indexOf('{');
    var end = body.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) throw new Error("no json");
    var obj = JSON.parse(body.slice(start, end + 1));
    obj = emptyAds(obj);
    body = JSON.stringify(obj) + body.slice(end + 1);
  } else if (url.indexOf("/wbapplua/wbpullad.lua") !== -1) {
    var obj2 = JSON.parse(body);
    obj2 = emptyAds(obj2);
    body = JSON.stringify(obj2);
  } else if (url.indexOf("/ad/preload") !== -1) {
    var obj3 = JSON.parse(body);
    obj3 = emptyAds(obj3);
    body = JSON.stringify(obj3);
  }
  $done({ body: body });
} catch (e) {
  $done({ body: body });
}
