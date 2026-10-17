/**
 * Shared class strings, so every control on every page has the same shape,
 * hover, press and focus. Radius profile: surfaces 16px, controls 8px.
 * The amber accent means one thing: you can press this.
 */

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300";

const PRESS =
  "transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.98]";

export const BUTTON_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300 active:bg-amber-500 ${PRESS} ${FOCUS}`;

export const BUTTON_SECONDARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 font-medium text-zinc-100 hover:border-white/30 hover:bg-white/10 ${PRESS} ${FOCUS}`;

export const LINK_GHOST = `inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-zinc-400 hover:bg-white/5 hover:text-white ${PRESS} ${FOCUS}`;
