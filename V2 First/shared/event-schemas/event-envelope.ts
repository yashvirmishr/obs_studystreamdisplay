/**
 * StudyStream2 normalised event types (v1).
 * Source of truth: event-envelope.v1.json. Keep in sync; schema is authoritative.
 */

export type EventSource =
  | "twitch"
  | "kick"
  | "youtube"
  | "streamelements"
  | "study"
  | "system"
  | "test";

export type EventType =
  | "chat.message"
  | "chat.deleted"
  | "chat.moderation"
  | "stream.follow"
  | "stream.cheer"
  | "stream.subscription"
  | "stream.gift_subscription"
  | "stream.raid"
  | "stream.gift"
  | "donation.tip"
  | "study.session.started"
  | "study.session.paused"
  | "study.session.stopped"
  | "media.now_playing.updated"
  | "system.connection.changed"
  | "system.test_event";

export type ChatBadge =
  | "moderator"
  | "subscriber"
  | "vip"
  | "broadcaster"
  | "verified"
  | "gilded"
  | "other";

export type MessageFragment =
  | { type: "text"; text: string }
  | { type: "emote"; emote_id: string; text: string }
  | { type: "emoji_image"; url: string; text: string };

export interface ChatMessagePayload {
  username: string;
  platform: "twitch" | "kick" | "youtube";
  fragments: MessageFragment[];
  badges?: ChatBadge[];
  username_color?: string;
  message_id?: string;
}

export interface TipPayload {
  donor_name: string;
  amount: number;
  currency: string; // ISO-4217 alpha-3
  message?: string;
  avatar_url?: string;
}

export interface CheerPayload {
  username: string;
  bits: number;
  message?: string;
}

export interface FollowPayload {
  username: string;
  platform: "twitch" | "kick";
  avatar_url?: string;
}

export interface RaidPayload {
  from_channel: string;
  viewers: number;
}

export interface NowPlayingPayload {
  title: string;
  channel: string;
  thumbnail_url?: string;
  video_url?: string;
  is_playing?: boolean;
}

export type EventPayload =
  | ChatMessagePayload
  | TipPayload
  | CheerPayload
  | FollowPayload
  | RaidPayload
  | NowPlayingPayload
  | Record<string, unknown>;

export interface EventEnvelope {
  schema_version: 1;
  event_id: string;
  event_type: EventType;
  source: EventSource;
  channel?: string;
  occurred_at: string; // ISO-8601 UTC
  received_at: string; // ISO-8601 UTC
  payload: EventPayload;
  is_simulated?: boolean;
}
