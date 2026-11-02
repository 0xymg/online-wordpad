export const printPageStyle = `
  @page { margin:0; }
  html,body { margin:0!important; padding:0!important; background:white!important; color:black!important; }
  .edtr-print-root { display:block!important; }
  .edtr-print-sheet { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  .edtr-print-sheet .pm-running-layer { display:block!important; }
  .edtr-print-sheet .pm-page-spacer,.edtr-print-sheet .pm-page-number { visibility:visible!important; }
  .edtr-print-sheet .pm-page-spacer-gap { background:white!important; }
  .edtr-print-sheet .pm-page-spacer-edge { box-shadow:none!important; }
  .edtr-print-sheet .pm-sheet-backgrounds { display:block!important; }
  .edtr-print-sheet .pm-section-sheet { background:transparent!important; box-shadow:none!important; }
  .edtr-print-sheet .pm-page { --sheet-bg:white!important; }
  .edtr-print-sheet .pm-page * { break-before:auto!important; break-after:auto!important; }
  .edtr-print-sheet hr.pm-page-break::after { display:none!important; }
`;
