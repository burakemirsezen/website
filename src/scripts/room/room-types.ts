// Options and labels for the listening room (plate-room.ts), shared with the pages that mount it.

export interface RoomTrack {
  title: string;
  url: string;
  duration: number;
  side?: 'A' | 'B';
}

export interface RoomRecord {
  title: string;
  artist: string;
  tracks?: RoomTrack[];
  url: string;
}

export interface RoomGear {
  title: string;
  text: string;
}

export interface RoomOptions {
  covers: string[];
  reducedMotion: boolean;
  /** Forces the light; by default it follows prefers-color-scheme. */
  mood?: 'day' | 'night';
  /** Hover labels for the sleeves, in the order of `covers`. */
  records?: RoomRecord[];
  /** Hover labels for the gear, keyed guitar, amp, interface, turntable, speakers. */
  gear?: Record<string, RoomGear>;
  /** Hour of the day (0-24) to light the room for; by default the time in Zurich now. */
  hour?: number;
  /** Called once, after the first frame is on the canvas. */
  onReady?: () => void;
}

export interface AsyncRoomOptions extends RoomOptions {
  /** Returns true once the visitor scrolls near the Music section so background slices accelerate. */
  isUrgent?: () => boolean;
  /** Registers a wakeup callback invoked when loading turns urgent; returns an unsubscribe fn. */
  subscribeUrgent?: (wake: () => void) => () => void;
  /** Aborts background building cleanly before completion. */
  signal?: AbortSignal;
}
