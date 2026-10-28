import type { Variants } from "motion/react";

/**
 * Shared "expand-from-a-trigger" menu animation — the horizontal pop-out used
 * by the header title's nav menu (Layout) and the Enroll semester picker
 * (Accordion). The container grows width 0 → auto on a spring while its
 * children stagger in with a scale-pop.
 */
export const menuContainerVariants: Variants = {
  hidden: { width: 0, opacity: 0 },
  visible: {
    width: "auto",
    opacity: 1,
    transition: {
      width: { type: "spring", bounce: 0.2, duration: 0.45 },
      opacity: { duration: 0.15 },
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
  exit: {
    width: 0,
    opacity: 0,
    transition: {
      width: { duration: 0.25 },
      opacity: { duration: 0.15 },
      staggerChildren: 0.04,
      staggerDirection: -1,
    },
  },
};

/**
 * Vertical counterpart of {@link menuContainerVariants} — same spring/stagger,
 * but reveals by growing height (drops the items down under the trigger instead
 * of expanding to the side).
 */
export const menuContainerVerticalVariants: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: "auto",
    opacity: 1,
    transition: {
      height: { type: "spring", bounce: 0.2, duration: 0.45 },
      opacity: { duration: 0.15 },
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.25 },
      opacity: { duration: 0.15 },
      staggerChildren: 0.04,
      staggerDirection: -1,
    },
  },
};

export const menuItemVariants: Variants = {
  hidden: { opacity: 0, scale: 0.6, x: -8 },
  visible: { opacity: 1, scale: 1, x: 0, transition: { type: "spring", bounce: 0.35 } },
  exit: { opacity: 0, scale: 0.6, x: -8, transition: { duration: 0.12 } },
};
