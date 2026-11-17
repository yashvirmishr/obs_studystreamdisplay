# RESEARCH_INTEGRATIONS.md — Phase 5–6 integration layer research

Research date: **2026-11-14**. All facts below were read from official
documentation on this date unless marked UNVERIFIED. No code, no endpoints
invented. Scope: unified chat + events/alerts for Twitch, Kick, YouTube.

Legend: **VERIFIED** = read directly from official docs. **UNVERIFIED** =
requires testing with a real account/extension.

## 1. StreamElements (Astro WebSocket gateway)

Docs moved to docs.streamelements.com (June 2026); API reference still at
dev.streamelements.com. https://docs.streamelements.com/changelog

### Verified facts
- Gateway: `wss://astro.streamelements.com/` — pub/sub; text frames only.
  First message is `welcome`; subscribe via `{type:"subscribe",
  data:{topic, room, token, token_type}}`. Server sends WebSocket PING
  frames every 30s; pong required within 70s or the socket closes.
  https://docs.streamelements.com/websockets
- Reconnect: on graceful shutdown the server sends a `reconnect` message
  with a `reconnect_token`; reconnect via
  `wss://astro.streamelements.com/?reconnect_token=...` and all
  subscriptions are restored automatically. Command rate limit: 1 command
  per 100ms, burst 100 per 10s.
- Auth: subscribing requires a token + `token_type`:
  - `jwt` — StreamElements JWT copied from the StreamElements dashboard
    (avatar menu → channel).
  - `apikey` — the channel's **Overlay Token** from the same dashboard
    page.
  - `oauth2` — an OAuth2 access token supplied by an OAuth2 integration.
  Tokens are **account-specific**: with multiple linked platforms
  (Twitch/YouTube/Kick), the token must be copied while the correct
  account is selected. So yes — the "overlay token" works, but the JWT or
  overlay token must come from a StreamElements account with the target
  channel connected. https://docs.streamelements.com/websockets#authentication
- Topic scopes (per-topic "required scope"):
  - `channel.chat`, `channel.chat.message`, `channel.songrequest` →
    `overlays:read`
  - `channel.activities` → `activities:read`
  - `channel.tips` → `tips:read`; `channel.tips.moderation` →
    `tips:moderation`
  - `channel.session.update/reset` → `session:read`;
    `channel.stream.status` → `stream-live:read`
  Scope list is advisory in docs; how scopes map to a dashboard-copied
  JWT is **UNVERIFIED**. https://docs.streamelements.com/websockets/topics
- `channel.chat` (launched **2026-11-03**) — one normalized format for
  Twitch, YouTube, Kick and X. Events: `message`, `message_deleted`
  (`message_id`), `user_cleared` (all of a user's messages removed;
  `duration_seconds` present for timeouts), `chat_cleared`. Message
  carries `id`, `author` (`id, login, name, color, avatar_url, roles,
  badges`), `text`, `fragments`, `kind`, optional `reply`. Fragment
  types: `text`, `emote` (`emote.id`), `mention`, `cheer`
  (`prefix, bits, tier`; Twitch only). Roles are a fixed cross-platform
  list: broadcaster, moderator, vip, subscriber, founder, verified,
  staff, bot. Emote images via
  `GET https://api.streamelements.com/kappa/v3/emotes/{channel}` plus
  CDN fallbacks. https://docs.streamelements.com/websockets/topics/channel-chat
- Platform moderation coverage of `channel.chat` (docs table):
  - `message_deleted`: Twitch **yes**, YouTube **no** ("YouTube doesn't
    send live deletes"), Kick **no**, X yes.
  - `user_cleared`: Twitch yes (no length), YouTube yes (with timeout
    length), Kick yes (with timeout length).
  - `chat_cleared`: Twitch only.
- `channel.chat.message` — same topics but the **raw platform payload**,
  unchanged (since 2026-11-03 previously-dropped fields pass through).
- `channel.activities` — normalized activity feed. `type` values include
  `follow`, `tip`, `cheer`, `subscriber`, `raid`, `host`, `superchat`,
  `communityGiftPurchase`, `sponsor`, `channelPointsRedemption`,
  `hypetrain*`, `purchase`, `merch`, etc. `provider` values include
  `twitch`, `youtube`, `kick`, `x`, `represent`, `fourthwall`,
  `StreamElements`. https://docs.streamelements.com/websockets/topics/channel-activities
- `channel.tips` — StreamElements tipping page tips only: `donation.user`,
  `message`, `amount`, `currency`, `paymentMethod`, plus `approved`,
  `status`, `transactionId`. https://docs.streamelements.com/websockets/topics/channel-tips
- Kick coverage (2026 changelog): KICKs (Kick's paid gifts) supported as
  a first-class event since **2026-09-13** (activity feed type, alert
  variables `{name}/{amount}/{message}`, `kicks-*` session keys). Kick
  subscriber totals corrected to use Kick's active subscriber count.
- YouTube coverage: super chats + **super stickers** and **Jewels**
  gifts supported since **2026-09-17**. Private/unlisted YouTube streams
  are **not** supported by StreamElements — only public livestreams.
- 2025–2026 API/versioning changes: new doc site (2026-06-05, with
  llms.txt); WebSocket docs overhauled to the Astro protocol spec
  (2026-03-20); new topics `channel.overlay.broadcast` (2026-03-17) and
  `channel.chatbot.audiencequeue` (2026-08-30); `channel.chat` +
  changed `channel.chat.message` semantics (2026-11-03). REST reference
  is versioned under `api.streamelements.com/kappa/...` (the emote
  example uses `kappa/v3`).

### Gaps vs required event set
- `chat.moderation` is partial: no per-message delete for Kick/YouTube
  via `channel.chat`; `user_cleared` covers timeouts/bans on all three
  majors; no automod/hold events (not in our required set).
- Tips (`donation.tip`) only cover StreamElements' own tipping page; a
  creator using another processor (e.g. Ko-fi) won't appear.
- Raid: `channel.activities` `raid` type exists for Twitch, but there is
  no dedicated raid topic with structured payload (viewer count etc.).
- Token acquisition is manual (dashboard copy). JWT expiry/refresh is
  **UNVERIFIED** (docs don't state a lifetime).

## 2. Twitch EventSub WebSocket

https://dev.twitch.tv/docs/eventsub/handling-websocket-events/

### Verified facts
- URL: `wss://eventsub.wss.twitch.tv/ws` (optional
  `?keepalive_timeout_seconds=10..600`). First message is
  `session_welcome` containing `session.id`, used in the subscription
  request's `transport.session_id`.
- Transport rules: client sends **nothing** except Pong (close 4001
  otherwise); must subscribe within **10s** of welcome (close 4003);
  keepalive if no notification within the timeout window; server PING
  frames must be answered with PONG (close 4002).
- Reconnect: `session_reconnect` message includes `reconnect_url`; you
  have **30s** to connect to it and close the old socket (close 4004).
  The new connection carries the same subscriptions. On an unexpected
  disconnect there is **no replay** — you must reconnect and resubscribe.
  Close codes 4000–4007 documented.
- Limits (per client_id+user token pair): max **3** WebSocket
  connections with enabled subscriptions, max **300** subscriptions per
  connection, `max_total_cost` = **10**.
- Auth: WebSocket subscriptions require a **user access token** (app
  tokens fail). Subscriptions are created via
  `POST https://api.twitch.tv/helix/eventsub/subscriptions`.
- Required subscription types + scopes (all VERIFIED from the Channel/
  Chat references, docs read 2026-11-14):
  - `channel.follow` v2 — scope `moderator:read:followers`; condition
    needs `broadcaster_user_id` **and** `moderator_user_id` (use the
    broadcaster's own ID if authorized as broadcaster).
  - `channel.subscribe` v1 — `channel:read:subscriptions`.
  - `channel.subscription.gift` v1 — `channel:read:subscriptions`.
  - `channel.subscription.message` v1 — `channel:read:subscriptions`
    (resub messages).
  - `channel.cheer` v1 — `bits:read`. (`channel.bits.use` v1 is the
    newer superset: cheers, Power-ups, custom Power-ups.)
  - `channel.raid` v1 — **no authorization required**; condition is
    either `from_broadcaster_user_id` or `to_broadcaster_user_id` (not
    both). Subscribe with `to_` to get raided.
  - `channel.chat.message` v1 — `user:read:chat` (user token) or app
    token with `user:read:chat`+`user:bot` on user + `channel:bot` on
    broadcaster; condition needs `broadcaster_user_id` and `user_id`
    (who to read chat as — usually our own user = broadcaster). Carries
    structured `message.fragments` (text/emote/mention + cheermote;
    `gif` fragment type added 2026-07-16) and `cheer` object.
  - `channel.chat.message_delete` v1 — same auth pattern
    (`user:read:chat`); payload includes `message_id`.
  - `channel.chat.clear`, `channel.chat.clear_user_messages`,
    `channel.chat_settings.update`, `channel.chat.notification` v1 —
    same `user:read:chat` auth; notification covers sub/resub/gift/raid
    notices (`notice_type` list, incl. `community_sub_gift`).
  - `channel.moderate` v2 (Channel Moderation reference) — moderation
    actions incl. ban/timeout/delete; scope `moderator:read:moderators`
    family applies per its page (scope list **UNVERIFIED** here — see
    open questions). Hype Train types migrated to **v2** (2025-06-13).
- 2025–2026 changes (from https://dev.twitch.tv/docs/change-log/):
  - Legacy **PubSub is retired** (deprecation Apr 2025; migration guide
    removed 2026-06-12) — EventSub is the only event transport.
  - Non-TLS WebSocket IRC connections decommissioned 2025-08-15
    (if we ever use IRC chat, TLS only).
  - `channel.bits.use` v1 (2025-02-27); `channel.custom_power_up_redemption.add`
    v1 (2026-05-19); `channel.chat.message` `gif` fragment (2026-07-16);
    `gifted_drops_summary` notice types (2026-10-01); doc site restyle
    (2026-11-10).
  - No "bot verification" requirement for EventSub was found in the
    changelog (unlike Kick, see §3).

### Gaps vs required event set
- Twitch-only events (cheer, raid) are complete. No YouTube/Kick here.
- `channel.raid` gives no viewer count in this doc excerpt beyond the
  raid payload fields — payload details (from/to users) are standard;
  viewer count **UNVERIFIED** (needs payload check).

## 3. Kick

Official developer docs: https://docs.kick.com (mirrors the
KickEngineering/KickDevDocs repo). API server: `https://api.kick.com`;
OAuth: `https://id.kick.com/oauth/authorize|token` (OAuth 2.1, code flow
+ PKCE). https://docs.kick.com/getting-started/generating-tokens-oauth2-flow.md

### Verified facts
- **Events are webhook-only.** The create-subscription endpoint's
  `method` field is `enum: ["webhook"]` — there is no WebSocket/realtime
  transport in the official API.
  https://docs.kick.com/events/subscribe-to-events.md
- Event scope: `events:subscribe` (one scope covers "all channel events
  e.g. chat messages, follows, subscriptions"). Subscription creation
  needs a user token with `events:subscribe` (broadcaster inferred) or
  an app token + `broadcaster_user_id`.
- Available events (v1): `chat.message.sent`, `channel.followed`,
  `channel.subscription.new`, `channel.subscription.renewal`,
  `channel.subscription.gifts`, `channel.reward.redemption.updated`,
  `livestream.status.updated`, `livestream.metadata.updated`,
  `moderation.banned`, `kicks.gifted`.
  https://docs.kick.com/events/event-types.md
- Limits: 10,000 subscriptions per event type per app; **`chat.message.sent`
  limited to 1,000 for unverified apps**; verification (email
  developers@kick.com) raises it to 10,000 and adds a verified badge.
  https://docs.kick.com/apis/faqs.md
- Webhook security: RSA signature in `Kick-Event-Signature` (base64,
  PKCS#1 v15, SHA-256) over `messageId + "." + timestamp + "." + rawBody`;
  public key fetched from
  `https://api.kick.com/public/v1/public-key` — must not be hardcoded
  (rotatable). If webhooks fail to process for over a day, Kick
  **auto-unsubscribes** the app. Headers include
  `Kick-Event-Message-Id` (ULID) for idempotency.
  https://docs.kick.com/events/webhook-security.md
- App registration: kick.com Account Settings → Developer tab; requires
  2FA; you supply the redirect URL. Docs' own "test it" flow uses
  `https://docs.kick.com` as the redirect, so arbitrary HTTPS redirects
  are allowed; whether `http://localhost` (non-TLS) redirects are
  permitted is **UNVERIFIED**. https://docs.kick.com/getting-started/kick-apps-setup.md
- Moderation events: only `moderation.banned` (ban or timeout —
  `metadata.expires_at` is null for permanent bans). There is **no
  chat-message-deleted event**; deletes are only possible via the
  `DELETE /chat/:message_id` API (added 2025-02-12), which is an
  action, not an event feed. https://docs.kick.com/changelog.md
- `kicks.gifted` (2025-10-21) includes `gift.amount`, `name`, `type`,
  `tier`, `message`, `pinned_time_seconds` (added 2025-11-27).
- Chat message payload: `sender.identity` (color, badges incl.
  subscriber/sub_gifter counts), `emotes` with positions, `replies_to`,
  `created_at`. Emote CDN: `https://files.kick.com/emotes/{id}/fullsize`
  (per StreamElements doc; Kick's own docs don't document an emote CDN).

### Local-only architecture assessment (required)
- **Direct Kick integration is not feasible locally.** Webhook delivery
  requires a **public HTTPS callback** that Kick can reach; our backend
  binds to 127.0.0.1 only (CODING_STANDARDS rule 2) and must not be
  exposed. A public relay (tunnel/hosted receiver) would violate the
  local-only rule and add a hosted component.
- **Kick events that are feasible locally without a relay:**
  - Chat messages + moderation reactions (`user_cleared` timeouts) via
    **StreamElements `channel.chat`** (Kick provider verified there),
    provided the user links their Kick channel to a StreamElements
    account.
  - KICKs gifts via StreamElements (2026-09-13) — again via SE Astro.
- **Not locally feasible:** none of Kick's 10 event types can reach a
  loopback-only backend directly; and even with a relay there is no
  message-delete event. If the user has no StreamElements account, Kick
  support degrades to chat-only via other means (**UNVERIFIED**: whether
  any public undocumented socket exists — we do not rely on undocumented
  endpoints).

## 4. YouTube "Now Playing" via MV3 extension

Goal: capture the media currently playing on youtube.com to show "now
playing" state locally (not a provider event feed).

### Verified facts
- **Manifest V2 is dead.** MV2 disabled for all users with Chrome 138
  (2025-07-24, re-enable option removed); `ExtensionManifestV2Availability`
  policy removed in Chrome 139. Any extension we ship must be MV3.
  https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline
- Media metadata source of truth: the **Media Session API** — pages set
  `navigator.mediaSession.metadata` (title/artist/album/artwork) and
  `playbackState`, surfaced in browser media controls.
  https://developer.chrome.com/blog/media-session,
  https://web.dev/articles/media-session
- Content scripts run in an **isolated world**: their `navigator` is not
  the page's, so a plain content script cannot read the page's
  `mediaSession` metadata (consistent with Chromium's isolated-world
  design; community projects confirm). Reading page-world state requires
  injecting into the page world (MV3 supports `world: "MAIN"` content
  scripts / user scripts) or scraping the DOM.
- Robust DOM signals that work from an isolated world: `document.title`
  (YouTube prefixes "(N) Title - YouTube"), `tabs` API fields
  (`title`, `audible`, `favIconUrl`), and the YouTube player DOM.
- 2025–2026 Chrome changes relevant here: MV3 service-worker
  lifecycle (event-driven; no persistent background), MV2 removal
  (above), and user-script/MAIN-world features gated on developer-mode
  settings. No Chrome change was found that blocks reading media
  metadata or `document.title` from extensions.

### Feasibility verdict
Feasible as an MV3 extension: a `tabs`-query + content-script (MAIN
world, `world: "MAIN"`) collector reading `document.title` +
`mediaSession` playback state, relaying to the backend over 127.0.0.1.
Whether YouTube reliably populates `mediaSession.metadata` on desktop
web is **UNVERIFIED** (needs a live test); `document.title` scraping is
the safe fallback. Exact `world: "MAIN"` manifest syntax and any
Chrome-side gating should be re-verified at implementation time
(**UNVERIFIED**).

## 5. Gap matrix vs required event set

Required set: follow, cheer, sub, gifted sub, raid, kick gifts,
donation.tip, chat.message, chat.deleted, chat.moderation.

| Event | Twitch | Kick | YouTube | Notes |
| --- | --- | --- | --- | --- |
| follow | EventSub `channel.follow` v2 (`moderator:read:followers`) or SE `channel.activities` (`follow`) | Kick `channel.followed` (webhook) / SE activities | SE activities (`follow`/`fan`) | SE covers all three |
| cheer | EventSub `channel.cheer`/`channel.bits.use` (`bits:read`); SE activities `cheer`; SE `channel.chat` cheer fragments | n/a (Kick has no bits) | n/a | Twitch only |
| sub | EventSub `channel.subscribe` (`channel:read:subscriptions`); SE activities `subscriber` | `channel.subscription.new` (webhook); SE activities | SE activities `sponsor` | SE covers all |
| gifted sub | EventSub `channel.subscription.gift`; SE `communityGiftPurchase` | `channel.subscription.gifts` (webhook); SE activities | n/a | SE covers |
| raid | EventSub `channel.raid` (no scope, `to_broadcaster_user_id`); SE activities `raid` | n/a | n/a | Twitch only |
| kick gifts (KICKs) | n/a | `kicks.gifted` (webhook); SE (2026-09-13) | n/a | **SE Astro is the only local-only path** |
| donation.tip | n/a (Twitch has no tips) | n/a | n/a | SE `channel.tips` (StreamElements tipping page only) |
| chat.message | EventSub `channel.chat.message` (`user:read:chat`) or SE `channel.chat` | `chat.message.sent` (webhook) / SE `channel.chat` | SE `channel.chat` (provider `youtube`) | SE unified format recommended |
| chat.deleted | EventSub `channel.chat.message_delete` (`user:read:chat`); SE `channel.chat` `message_deleted` (Twitch/X) | **none** (no event) | **none** (YouTube sends no live deletes) | Twitch-only effectively |
| chat.moderation | EventSub `channel.chat.clear`, `clear_user_messages`, `channel.moderate` v2; SE `user_cleared`/`chat_cleared` | `moderation.banned` (webhook); SE `user_cleared` (timeout length) | SE `user_cleared` (timeout length); no clear events | SE covers bans/timeouts on all three |

## 6. Recommendation matrix (provider per platform × event)

- **Twitch:** use **Twitch EventSub WebSocket directly** (one socket)
  for follow/cheer/sub/gifts/raid + `channel.chat.message`,
  `message_delete`, `chat.clear*` — richest payloads, no third-party
  account. StreamElements Astro as optional secondary (unified format,
  tips if the user uses SE tipping).
- **Kick:** use **StreamElements Astro** (`channel.chat` Kick provider +
  KICKs/activities) — the only local-only path. Skip Kick's official
  webhooks entirely (requires public HTTPS callback + auto-unsub + no
  delete event). Direct Kick OAuth/API only if we later add sending
  chat / moderation actions.
- **YouTube:** use **StreamElements Astro** for super chats/stickers/
  Jewels/members (private/unlisted streams unsupported) + `channel.chat`
  messages. Now-playing state via our **own MV3 extension** (§4).
- **Cross-cutting:** chat rendering should consume SE `channel.chat`
  fragments as the primary source (single format, moderation events
  included) with Twitch EventSub as the fidelity upgrade where scopes
  are granted.

## 7. Open questions for the user

1. **StreamElements account:** are you willing to create/link a
   StreamElements account and connect your Kick (+ YouTube) channels to
   it? Kick support in a local-only architecture depends on it.
2. **SE token handling:** the JWT/Overlay Token is copied manually from
   the dashboard. Acceptable to paste it into the app (stored in the OS
   credential vault per rule 3)? Its expiry/refresh behavior is
   UNVERIFIED — needs testing.
3. **SE terms:** using a dashboard-copied token programmatically (not an
   official OAuth app) is what the docs describe for widgets, but its
   terms-of-use status for a desktop app is UNVERIFIED — confirm you're
   comfortable.
4. **Twitch OAuth app registration:** Twitch EventSub needs a Twitch
   developer application (client ID) + your authorization with
   `moderator:read:followers`, `channel:read:subscriptions`, `bits:read`,
   `user:read:chat` (and optionally `channel:bot` for chat sends).
   Register one? Redirect URI options for a desktop app (loopback
   redirect) need a decision.
5. **Kick app registration:** register a Kick app (client ID/secret) even
   though we skip its webhooks, so we could send chat later? Requires 2FA
   and a redirect URL.
6. **donation.tip source:** do you use (or plan to use) StreamElements
   tipping? If not, which processor (Ko-fi, etc.) so we can research its
   local feasibility in a follow-up?
7. **Now Playing scope:** Chrome-only, or also Edge/Firefox? (MV3 applies
   broadly, but MV2-less Firefox specifics differ.)
8. **chat.moderation depth:** is ban/timeout/clear enough (what SE and
   Kick provide), or do we require per-message deletes on Kick/YouTube,
   which no provider can supply?

## 8. Verification status summary

- VERIFIED from official docs on 2026-11-14: everything in §1–§3
  attributed above, §4 MV2/MV3 timeline and Media Session API.
- UNVERIFIED (needs a real account/extension):
  - SE JWT/overlay-token scope mapping and expiry; live event coverage
    for Kick provider (`channel.chat` fields per provider beyond the
    documented moderation table).
  - Twitch `channel.moderate` v2 exact scope string; `channel.raid`
    payload viewer count.
  - Kick localhost OAuth redirect acceptance; live webhook signature
    behavior (moot unless we adopt webhooks via a relay we've ruled out).
  - YouTube `mediaSession.metadata` population on desktop web; MV3
    `world: "MAIN"` manifest gating in current Chrome.
