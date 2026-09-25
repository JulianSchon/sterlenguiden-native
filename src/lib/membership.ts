/**
 * Medlemskap i Österlenpasset — hur vi avgör om någon är medlem och till när.
 *
 * profiles innehåller:
 *  - is_member          servern sätter den (betalning eller inlöst kod)
 *  - member_started_at  när passet börjar gälla (framtida = present som ännu inte startat)
 *  - member_until       betald tid räcker till detta datum (vid automatisk förnyelse
 *                       skjuter betalleverantören fram det vid varje förnyelse)
 *  - member_auto_renew  passet förnyas automatiskt
 *  - member_bonus_days  sparade dagar från presentkoder som löstes in medan passet
 *                       förnyades. De väntar och används först när passet inte längre
 *                       förnyas, så en gåva aldrig försvinner.
 *  - member_period      vilken sorts pass det senaste köpet gällde (week, month, …)
 */

export interface MembershipFields {
  is_member?: boolean | null;
  member_period?: string | null;
  member_started_at?: string | null;
  member_until?: string | null;
  member_auto_renew?: boolean | null;
  member_bonus_days?: number | null;
}

export interface MembershipStatus {
  active: boolean;
  /** Sista dagen man har åtkomst, inklusive sparade dagar när passet inte förnyas. null = ingen slutdag. */
  until: Date | null;
  autoRenews: boolean;
  /** När nästa förnyelse sker (bara om det förnyas automatiskt) */
  renewsOn: Date | null;
  /** Sparade presentdagar som väntar på att användas */
  waitingBonusDays: number;
  period: string | null;
}

const DAY_MS = 86_400_000;

export function membershipStatus(
  profile: MembershipFields | null | undefined,
  now = new Date()
): MembershipStatus {
  const autoRenews = !!profile?.member_auto_renew;
  const bonusDays = profile?.member_bonus_days ?? 0;
  const paidUntil = profile?.member_until ? new Date(profile.member_until) : null;
  const startsAt = profile?.member_started_at ? new Date(profile.member_started_at) : null;

  // Under en förnyande prenumeration väntar presentdagarna; annars läggs de efter betald tid
  const until = paidUntil && !autoRenews && bonusDays > 0
    ? new Date(paidUntil.getTime() + bonusDays * DAY_MS)
    : paidUntil;

  const notStarted = !!startsAt && startsAt.getTime() > now.getTime();
  const expired = !!until && until.getTime() < now.getTime();

  return {
    active: !!profile?.is_member && !notStarted && !expired,
    until,
    autoRenews,
    renewsOn: autoRenews ? paidUntil : null,
    waitingBonusDays: autoRenews ? bonusDays : 0,
    period: profile?.member_period ?? null,
  };
}

export function isActiveMember(profile: MembershipFields | null | undefined, now = new Date()): boolean {
  return membershipStatus(profile, now).active;
}
