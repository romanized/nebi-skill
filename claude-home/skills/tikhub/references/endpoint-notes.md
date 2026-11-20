# TikHub endpoint notes

What live calls showed, beyond the proven-calls table in SKILL.md. Source: an ad and hook research run of 79 saved responses on 2026-09-05, plus `get_endpoint_info` and `get_tiered_discount_info` calls on 2026-09-03. Recheck anything you build a report on; TikHub changes without notice.

## More calls that answered

| Need | Endpoint | Notes |
|---|---|---|
| TikTok Creative Center ads by keyword | `POST /api/v1/tiktok/ads/search_ads` | rows carry `ad_title`, `brand_name`, `ctr`, `like`, `cost`, `objective_key`, `video_info`. Read the warning below first. |
| One ad expanded | `POST /api/v1/tiktok/ads/get_ads_detail` | takes an ad id returned by `search_ads` |
| Instagram hashtag posts (v2) | `GET /api/v1/instagram/v2/fetch_hashtag_posts` | returns the posts themselves |
| An Instagram account's posts | `GET /api/v1/instagram/v2/fetch_user_posts` | paginates with `pagination_token` |

`GET /api/v1/instagram/v3/search_hashtags` (hashtag reach) is listed at $0.008 a call but has not been called live.

## The `/api/v1/tiktok/ads/*` family is POST-only

`search_ads`, `get_ads_detail` and `get_trends_hashtag_list` answer GET with 405. Use the helper's `post` subcommand. The body is type-checked: `country_code` is a string; `page`, `limit`, `period` and `time_range` must be integers, and a quoted `"20"` is rejected. `--param limit=20` sends an integer.

## `search_ads` ignores `country_code` and `keyword`

It returns 200 with a pool that has little to do with the request (checked by diffing the saved JSON on 2026-09-05):

- Five related German keywords returned one identical set of 19 ad ids.
- Two different countries returned the same 19 ids in the same order; only the signed CDN URLs in `video_info` differed.
- It is not reliably ignored either: one keyword returned a different 20 with zero overlap, another returned 0.
- `order_by=ctr` sorts nothing.

The filter that works is `period`: the same keyword gave `total_count` 0 at `period=30` and 19 at `period=180`. Read the rows as one global pool of ads that mention the term. An ad's own declared targeting country is real; the `country_code` you sent is not. Do not build a country split on this endpoint.

## Cost

Listed prices from `get_endpoint_info` (works even on an expired key, so it proves nothing about the key):

| Endpoint | Cost | Free-credit eligible | Volume discount |
|---|---|---|---|
| `GET /api/v1/tiktok/app/v3/fetch_video_search_result` | $0.001 | yes | no |
| `GET /api/v1/tiktok/web/fetch_tag_detail` | $0.001 | yes | yes |
| `POST /api/v1/tiktok/ads/get_trends_hashtag_list` | $0.001 | no | no |
| `POST /api/v1/tiktok/ads/search_ads` | $0.001 | yes | yes |
| `GET /api/v1/instagram/v3/search_hashtags` | $0.008 | no | no |

The volume discount on eligible endpoints scales with requests per day: 0% under 1,000 a day, up to 50% above 30,000.

**A 200 can bill for nothing.** The envelope says `"Request successful. This request will incur a charge."` before the inner payload is checked, and the inner payload can be a failure: HTTP 200 with `data` = `{"status": false, "errorMessage": "The requested resource does not exist..."}`. Check the inner `status`/`data` before counting a call as a result, and budget for charged misses. To measure real spend, diff `balance_usd` from `whoami` before and after a batch.

## Scopes

`whoami` returns `api_key_scopes`, a list of path prefixes such as `/api/v1/tiktok/`. If a call returns a scope error (different from "token expired"), stop and name the missing prefix for Nebi. Do not route around it through another endpoint.

## Key safety

- Auth-failure bodies echo the request headers back in `error.detail.headers`, bearer included. `tikhub.py` strips them; with `curl`, never print a raw body without redacting `Authorization`.
- TikHub sits behind Cloudflare, which blocks Python's default urllib User-Agent with a plain-text "error code: 1010". The helper sends its own User-Agent.
- The helper pins the host to `api.tikhub.io` before attaching the bearer and refuses redirects that leave it, because `get` and `post` take any path and urllib re-sends headers on a redirect. Keep both checks in anything new that carries this key.
