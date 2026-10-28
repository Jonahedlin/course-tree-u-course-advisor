import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * User preferences persisted to localStorage:
 *  - `interactivity`: whether the animated bubble background runs.
 *  - `accentHue`: the selected accent (1..HUE_COUNT) — applied to `--brand`
 *    on load so the chosen accent is the default across reloads.
 */

const HUE_COUNT = 6;
const DEFAULT_HUE = 3; // Forest (--hue-3)

const KEY_INTERACT = "uca:interactivity";
const KEY_ACCENT = "uca:accent-hue";
const KEY_REMEMBER = "uca:remember-accent";
const KEY_UNBC_UNLOCKED = "uca:unbc-unlocked";
const KEY_UNBC_ACTIVE = "uca:unbc-active";
const KEY_SPICE_UNLOCKED = "uca:spice-unlocked";
const KEY_SPLASH_CURSOR_ENABLED = "uca:splash-cursor-enabled";

// Secret UNBC school colours — unlocked by clicking the app heading 20 times.
// Unlike the six hues (whose background is derived from the accent), UNBC uses
// two independent colours: a gold accent over a deep-green background.
const UNBC_BRAND = "#976F00"; // text / fonts / accents
const UNBC_BG = "#31572c";    // background accent

function readRemember(): boolean {
  const s = localStorage.getItem(KEY_REMEMBER);
  return s === null ? true : s === "true"; // default: remember
}

interface PreferencesValue {
  interactivity: boolean;
  setInteractivity: (v: boolean) => void;
  accentHue: number;
  setAccentHue: (n: number) => void;
  /** When on, the selected accent is saved as the default across reloads. */
  rememberAccent: boolean;
  setRememberAccent: (v: boolean) => void;
  /** Secret UNBC theme — earned by clicking the app heading 20 times. */
  unbcUnlocked: boolean;
  /** Whether the UNBC theme is the one currently applied. */
  unbcActive: boolean;
  /** Unlock + immediately apply the UNBC theme (called by the easter egg). */
  unlockUnbc: () => void;
  /** Re-apply the UNBC theme after it's already been unlocked. */
  applyUnbc: () => void;
  /** Secret "Spice" easter egg — earned by filling every DUNE course into the
   * course tree. Unlocking only reveals the Splash Cursor toggle in Settings;
   * it doesn't turn the cursor on by itself. */
  spiceUnlocked: boolean;
  unlockSpice: () => void;
  /** Whether the WebGL splash-cursor effect is currently active app-wide. */
  splashCursorEnabled: boolean;
  setSplashCursorEnabled: (v: boolean) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

/** Point `--brand` at the chosen hue's colour. */
function applyAccent(hue: number) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--hue-${hue}`)
    .trim();
  if (value) document.documentElement.style.setProperty("--brand", value);
}

/** Paint the secret UNBC palette: gold accent over a deep-green background. */
function applyUnbcColors() {
  const s = document.documentElement.style;
  s.setProperty("--brand", UNBC_BRAND);
  // Keep the accent variants gold too so hovers don't bleed the default green.
  s.setProperty("--brand-light", UNBC_BRAND);
  s.setProperty("--brand-dark", UNBC_BRAND);
  s.setProperty("--brand-bg", UNBC_BG);
}

/** Remove the UNBC overrides so `--brand`/background fall back to the hue. */
function clearUnbcColors() {
  const s = document.documentElement.style;
  s.removeProperty("--brand-light");
  s.removeProperty("--brand-dark");
  s.removeProperty("--brand-bg");
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [interactivity, setInteractivityState] = useState<boolean>(() => {
    const stored = localStorage.getItem(KEY_INTERACT);
    return stored === null ? true : stored === "true";
  });

  const [rememberAccent, setRememberAccentState] =
    useState<boolean>(readRemember);

  const [accentHue, setAccentHueState] = useState<number>(() => {
    if (!readRemember()) return DEFAULT_HUE;
    const n = parseInt(localStorage.getItem(KEY_ACCENT) ?? "", 10);
    return Number.isFinite(n) && n >= 1 && n <= HUE_COUNT ? n : DEFAULT_HUE;
  });

  const [unbcUnlocked, setUnbcUnlocked] = useState<boolean>(
    () => localStorage.getItem(KEY_UNBC_UNLOCKED) === "true",
  );
  const [unbcActive, setUnbcActive] = useState<boolean>(
    () => localStorage.getItem(KEY_UNBC_ACTIVE) === "true",
  );

  const [spiceUnlocked, setSpiceUnlocked] = useState<boolean>(
    () => localStorage.getItem(KEY_SPICE_UNLOCKED) === "true",
  );
  const [splashCursorEnabled, setSplashCursorEnabledState] = useState<boolean>(
    () => localStorage.getItem(KEY_SPLASH_CURSOR_ENABLED) === "true",
  );

  // Apply the palette before paint. UNBC (once active) wins over the hue; when
  // it's off, its overrides are cleared and the chosen hue is applied.
  useLayoutEffect(() => {
    if (unbcActive) {
      applyUnbcColors();
    } else {
      clearUnbcColors();
      applyAccent(accentHue);
    }
  }, [unbcActive, accentHue]);

  // Stable identities: consumers (e.g. the DUNE easter egg's reveal timer in
  // CourseSelection) depend on these functions in effect dependency arrays.
  // Without useCallback, every one of these was a new function on every
  // render of this provider — including renders triggered by unrelated
  // ancestors — which reset any effect timer keyed on them before it could
  // ever complete.
  const setInteractivity = useCallback((v: boolean) => {
    localStorage.setItem(KEY_INTERACT, String(v));
    setInteractivityState(v);
  }, []);

  const setAccentHue = useCallback(
    (n: number) => {
      // Choosing a hue switches off the UNBC theme (but keeps it unlocked).
      if (unbcActive) {
        localStorage.setItem(KEY_UNBC_ACTIVE, "false");
        setUnbcActive(false);
      }
      setAccentHueState(n);
      if (rememberAccent) localStorage.setItem(KEY_ACCENT, String(n));
    },
    [unbcActive, rememberAccent],
  );

  const unlockUnbc = useCallback(() => {
    localStorage.setItem(KEY_UNBC_UNLOCKED, "true");
    localStorage.setItem(KEY_UNBC_ACTIVE, "true");
    setUnbcUnlocked(true);
    setUnbcActive(true);
  }, []);

  const applyUnbc = useCallback(() => {
    localStorage.setItem(KEY_UNBC_ACTIVE, "true");
    setUnbcActive(true);
  }, []);

  const unlockSpice = useCallback(() => {
    localStorage.setItem(KEY_SPICE_UNLOCKED, "true");
    setSpiceUnlocked(true);
  }, []);

  const setSplashCursorEnabled = useCallback((v: boolean) => {
    localStorage.setItem(KEY_SPLASH_CURSOR_ENABLED, String(v));
    setSplashCursorEnabledState(v);
  }, []);

  const setRememberAccent = useCallback(
    (v: boolean) => {
      setRememberAccentState(v);
      localStorage.setItem(KEY_REMEMBER, String(v));
      if (v) localStorage.setItem(KEY_ACCENT, String(accentHue));
      else localStorage.removeItem(KEY_ACCENT);
    },
    [accentHue],
  );

  // Memoized so consumers only re-render when a value they actually read
  // changes, rather than on every render of this provider.
  const value = useMemo(
    () => ({
      interactivity,
      setInteractivity,
      accentHue,
      setAccentHue,
      rememberAccent,
      setRememberAccent,
      unbcUnlocked,
      unbcActive,
      unlockUnbc,
      applyUnbc,
      spiceUnlocked,
      unlockSpice,
      splashCursorEnabled,
      setSplashCursorEnabled,
    }),
    [
      interactivity,
      setInteractivity,
      accentHue,
      setAccentHue,
      rememberAccent,
      setRememberAccent,
      unbcUnlocked,
      unbcActive,
      unlockUnbc,
      applyUnbc,
      spiceUnlocked,
      unlockSpice,
      splashCursorEnabled,
      setSplashCursorEnabled,
    ],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx)
    throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
