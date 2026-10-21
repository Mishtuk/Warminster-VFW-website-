// Every hall-rental photo, in viewing order (outside first, then the stage and the room). Used by the full gallery on /hall and the home hall band.
export const HALL_PHOTOS = [
  ...['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'].map((n) => ({
    name: `hall-${n}`,
    alt: n === '01' ? 'The outside of the post building' : n === '02' ? 'The stage with a blue curtain and a US flag' : 'Inside the hall at the post',
    cap: n === '01' ? 'The outside of the post' : n === '02' ? 'The stage' : 'The hall',
  })),
  { name: 'life-60th-tables', alt: 'Tables dressed for the 60th anniversary dinner', cap: 'The hall set for the 60th anniversary dinner' },
];

// The handful shown on /hall before "See all": the outside, then the shots that differ most from each other.
export const HALL_FEATURED = [
  { name: 'hall-01', alt: 'The outside of the post building' },
  { name: 'hall-02', alt: 'The stage with a blue curtain, a US flag and speakers' },
  { name: 'hall-05', alt: 'A round table set for a party, with a flag on the wall' },
  { name: 'hall-10', alt: 'The stage and the dance floor' },
  { name: 'hall-04', alt: 'The wide dance floor with tables along the walls' },
  { name: 'life-60th-tables', alt: 'Tables dressed for the 60th anniversary dinner' },
];
