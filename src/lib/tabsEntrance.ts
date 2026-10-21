/**
 * Hur appen (flikarna) kommer in. Efter onboardingen glider Hem upp underifrån, som när man sveper upp
 * för att låsa upp telefonen; annars som vanligt. Rotlayoutens animation för (tabs) läser värdet.
 */
let fromBelow = false;

export function tabsEnterFromBelow(): boolean {
  return fromBelow;
}

/** Nästa gång flikarna öppnas glider de upp underifrån (gäller en kort stund) */
export function enterTabsFromBelow(): void {
  fromBelow = true;
  setTimeout(() => { fromBelow = false; }, 1500);
}
