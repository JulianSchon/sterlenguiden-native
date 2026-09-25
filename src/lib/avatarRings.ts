/**
 * Profilringar: ramen runt profilbilden. Ringar tjänas in genom klistermärken och
 * troféer och säljs aldrig (annars kräver Apple köp i appen). Vad som låser upp
 * vilken ring bestäms när klistermärkena och troféerna polerats; tills dess är
 * ringarna med `unlocked: false` synliga men låsta.
 */

export interface AvatarRingDef {
  id: string;
  /** Kan användaren välja den just nu? */
  unlocked: boolean;
}

export const AVATAR_RINGS: AvatarRingDef[] = [
  { id: "none", unlocked: true },
  { id: "gold", unlocked: true },
  { id: "lightning", unlocked: false },
];
