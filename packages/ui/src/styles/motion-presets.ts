/**
 * Spring-physics animation presets for the Void design system.
 * Uses the `motion` library (Framer Motion Solid port).
 *
 * Usage:
 *   import { springPresets } from "@opencode-ai/ui/styles/motion-presets"
 *   animate(element, { opacity: [0, 1] }, springPresets.messageEntry)
 */

export const springPresets = {
  /** Smooth message entry — slight upward drift with gentle fade */
  messageEntry: {
    type: "spring" as const,
    visualDuration: 0.4,
    bounce: 0,
    opacity: { duration: 0.25 },
    y: { type: "spring" as const, visualDuration: 0.5, bounce: 0.08 },
  },

  /** Tool card expand/collapse — crisp height transition */
  toolExpand: {
    type: "spring" as const,
    visualDuration: 0.35,
    bounce: 0,
  },

  /** Status pill transition — quick swap between states */
  statusPill: {
    type: "spring" as const,
    visualDuration: 0.25,
    bounce: 0.1,
  },

  /** Panel resize — magnetic snap feel */
  panelResize: {
    type: "spring" as const,
    visualDuration: 0.5,
    bounce: 0.04,
  },

  /** Subtle hover lift — barely perceptible depth change */
  hoverLift: {
    type: "spring" as const,
    visualDuration: 0.2,
    bounce: 0,
  },

  /** Thinking card reveal — slow, contemplative emergence */
  thinkingReveal: {
    type: "spring" as const,
    visualDuration: 0.6,
    bounce: 0,
    opacity: { duration: 0.4 },
  },

  /** Checkmark pop — satisfying completion bounce */
  checkPop: {
    type: "spring" as const,
    visualDuration: 0.3,
    bounce: 0.3,
  },

  /** Error shake — quick horizontal displacement */
  errorShake: {
    type: "spring" as const,
    visualDuration: 0.15,
    bounce: 0.5,
  },

  /** Tab switch — fast content transition */
  tabSwitch: {
    type: "spring" as const,
    visualDuration: 0.2,
    bounce: 0,
  },

  /** Accordion open — smooth height reveal */
  accordionOpen: {
    type: "spring" as const,
    visualDuration: 0.4,
    bounce: 0,
  },
} as const

export type SpringPreset = (typeof springPresets)[keyof typeof springPresets]
