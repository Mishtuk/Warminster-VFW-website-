// Every hall-rental photo, in viewing order (stage first, outside last). Used by /hall and the home hall band.
export const HALL_PHOTOS = [
  ...['02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '01'].map((n) => ({
    name: `hall-${n}`,
    alt: n === '01' ? 'The outside of the post building' : n === '02' ? 'The stage with a blue curtain and a US flag' : 'Inside the hall at the post',
    cap: n === '01' ? 'The outside of the post' : n === '02' ? 'The stage' : 'The hall',
  })),
  { name: 'life-60th-tables', alt: 'Tables dressed for the 60th anniversary dinner', cap: 'The hall set for the 60th anniversary dinner' },
];
