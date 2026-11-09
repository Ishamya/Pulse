import { ControllerChannel } from "./channels";
import type { AudioEngine } from "../audio/AudioEngine";
import { isControllerId } from "./protocol";

const STORAGE_KEY = "pulse.visual-controller.v1";

/** Keep refreshes on the same channel, but give duplicated controller tabs a new
 * channel when their copied sessionStorage identity is already locked. */
export function startControllerSession(
  source: Pick<AudioEngine, "signal" | "getSnapshot">,
  onReady: (id: string) => void,
  onError: () => void,
) {
  let cancelled = false;
  let release: (() => void) | undefined;
  let publisher: ControllerChannel | undefined;
  let pendingClaim: AbortController | undefined;
  let claimTimer: ReturnType<typeof setTimeout> | undefined;
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    /* Storage may be blocked. */
  }
  const attach = (id: string) => {
    if (cancelled) return;
    publisher = new ControllerChannel(id, source);
    window.addEventListener("pagehide", publisher.suspend);
    window.addEventListener("pageshow", publisher.resume);
    onReady(id);
  };
  const acquire = async (id: string): Promise<void> => {
    if (cancelled) return;
    const claim = new AbortController();
    pendingClaim = claim;
    // Let navigation/StrictMode release the previous document's lock before
    // deciding that this is a separately duplicated controller tab.
    const timer = setTimeout(() => claim.abort(), 250);
    claimTimer = timer;
    try {
      await navigator.locks.request(
        `pulse:controller:${id}`,
        { signal: claim.signal },
        async () => {
          clearTimeout(timer);
          if (cancelled) return;
          try {
            sessionStorage.setItem(STORAGE_KEY, id);
          } catch {
            /* Storage may be blocked. */
          }
          attach(id);
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        },
      );
    } catch (error) {
      if (cancelled) return;
      if (claim.signal.aborted) await acquire(crypto.randomUUID());
      else throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  if (typeof BroadcastChannel === "undefined") {
    onError();
  } else if (navigator.locks) {
    void acquire(isControllerId(saved) ? saved : crypto.randomUUID()).catch(
      () => {
        if (!cancelled) onError();
      },
    );
  } else {
    // Never reuse a potentially copied identity without an exclusive Web Lock.
    try {
      attach(crypto.randomUUID());
    } catch {
      onError();
    }
  }
  return () => {
    cancelled = true;
    clearTimeout(claimTimer);
    pendingClaim?.abort();
    if (publisher) {
      window.removeEventListener("pagehide", publisher.suspend);
      window.removeEventListener("pageshow", publisher.resume);
      publisher.dispose();
    }
    release?.();
  };
}
