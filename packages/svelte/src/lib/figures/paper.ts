// figures/paper.ts: the soft paper look every curated figure shares on top of
// the kit's ISO_CSS: the lifted dark ramp (panel #1d1d1a, tops #4a4a44, sides
// #3a3a35..#2c2c28, light lines at 40/30/16%) so a figure reads as clearly in
// dark as in light. Scoped to figure hosts; the theme comes from data-theme,
// which the Figure widget sets from Ripple's root theme class.
export const PAPER_CSS = `
.iso[data-theme="dark"][data-figure-host]{
  --anatomy-page:#161614;--anatomy-card:#1d1d1a;--anatomy-paper:#1d1d1a;--anatomy-face:#3a3a35;--anatomy-top:#4a4a44;
  --anatomy-shade-0:#2c2c28;--anatomy-shade-1:#33332e;--anatomy-shade-2:#3a3a35;--anatomy-shade-3:#42423c;
  --anatomy-lit-top:#56564f;--anatomy-lit-shade:#46463f;
  --anatomy-hi:#ecece6;--anatomy-mid:#e8e8e266;--anatomy-lo:#e8e8e24d;--anatomy-faint:#e8e8e229;--anatomy-lit:#ffffff;
  --anatomy-halo:#000000;--anatomy-halo-opacity:.55;--anatomy-dot:#ecece6
}
`;
