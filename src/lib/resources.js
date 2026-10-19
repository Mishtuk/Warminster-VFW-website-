// Outside-world content for /resources, /programs and /history. Every entry traces to docs/research.md.
export const BENEFITS = [
  { name: 'VA.gov', line: 'Benefits, health care and how to apply.', url: 'https://www.va.gov' },
  { name: 'VFW free claims help', line: 'Accredited VFW Service Officers help with VA claims at no cost.', url: 'https://www.vfw.org/assistance/va-claims-separation-benefits' },
  { name: 'Start a claim with the VFW', line: 'Begin a VA claim online with VFW support.', url: 'https://claims.vfw.org' },
  { name: 'VFW financial assistance', line: 'Grants for service members, paid to creditors.', url: 'https://www.vfw.org/assistance/financial-grants' },
  { name: 'PA Dept. of Military and Veterans Affairs', line: 'State programs, including the Veterans Trust Fund and PA VETConnect.', url: 'https://www.pa.gov/agencies/dmva' },
  { name: 'Bucks County Military and Veterans Affairs', line: '55 East Court St, Doylestown, PA 18901. Phone 215-345-3307. Call to confirm hours.', url: 'https://buckscounty.gov/Directory.aspx?DID=87' },
  { name: 'Vet Centers', line: 'Readjustment counseling for veterans and families.', url: 'https://www.vetcenter.va.gov/' },
  { name: 'VA mental health', line: 'Mental health care and support from the VA.', url: 'https://www.mentalhealth.va.gov/' },
  { name: 'Corporal Michael J. Crescenz VA Medical Center', line: '3900 Woodland Ave, Philadelphia, PA 19104.', url: 'https://www.va.gov/philadelphia-health-care/locations/' },
  { name: 'VFW Find a Post', line: 'Locate other VFW posts and what they offer.', url: 'https://www.vfw.org/find-a-post' },
];

// vdOnly: true = holiday or limited-time offer, not year round.
export const DISCOUNTS = [
  { cat: 'Shopping', items: [
    { biz: 'The Home Depot', offer: '10% off eligible purchases for veterans, with a yearly cap. Verify online first.', url: 'https://ir.homedepot.com/news-releases/2021/12-28-2021-130107362' },
    { biz: "Lowe's", offer: '10% off most items with military ID or a MyLowe\'s account. Check who qualifies.', url: 'https://www.militarytimes.com/articles/lowes-expands-changes-its-military-discount-program' },
    { biz: 'Target', offer: '10% around Veterans Day and July 4 with Target Circle. Not year round.', url: 'https://corporate.target.com/press/fact-sheet/2023/10/target-is-again-thanking-military-families-with-a-discount-for-veterans-day', vdOnly: true },
  ] },
  { cat: 'Dining', items: [
    { biz: "Applebee's", offer: 'Free full-size entree on Veterans Day (November 11), dine-in. Bring proof of service.', url: 'https://www.applebees.com/en/news/2025/applebees-honors-veterans-and-active-duty-military-with-free-meals-on-veterans-day', vdOnly: true },
  ] },
  { cat: 'Fun and fitness', items: [
    { biz: 'Sesame Place Philadelphia (Langhorne)', offer: 'Veterans 50% off single-day tickets, up to 6 per person per visit, online only, valid through December 31, 2026.', url: 'https://sesameplace.com/philadelphia/tickets/military/veteran-offer/' },
    { biz: 'Planet Fitness', offer: 'Free workouts during Veterans Day week in past years. No ongoing national veteran discount confirmed.', url: 'https://www.military.com/discounts/planet-fitness-veterans-day-military-discount', vdOnly: true },
  ] },
  { cat: 'Phone plans', items: [
    { biz: 'T-Mobile', offer: 'Military Savings plans for veterans, verified after activation.', url: 'https://www.t-mobile.com/cell-phone-plans/military-discount-plans' },
    { biz: 'Verizon', offer: 'Plan discounts for veterans. Amounts vary, so confirm with Verizon.', url: 'https://www.verizon.com/support/military-veterans-faqs/' },
  ] },
];

export const PROGRAMS = {
  youth: [
    { name: 'Voice of Democracy', line: 'Audio essay contest for grades 9 to 12. Entry deadline October 31.', url: 'https://www.vfw.org/community/youth-and-education/youth-scholarships' },
    { name: "Patriot's Pen", line: 'Essay contest for grades 6 to 8, 300 to 400 words. Entry deadline October 31.', url: 'https://www.vfw.org/community/youth-and-education/youth-scholarships' },
    { name: 'Scout of the Year', line: 'Annual honor for Scouts, Girl Scouts, Sea Scouts and Venturing youth.', url: 'https://www.vfw.org/community/youth-and-education/scout-of-the-year' },
    { name: 'Teacher of the Year', line: 'Honors three teachers: elementary, junior high and high school.', url: 'https://www.vfw.org/community/youth-and-education/teacher-of-the-year' },
  ],
  service: [
    { name: 'Buddy Poppy', line: 'Poppies assembled by disabled and needy veterans. Donations fund veteran relief.', url: 'https://www.vfw.org/community/community-initiatives/buddy-poppy' },
    { name: 'Community initiatives', line: 'Volunteer projects in education, the environment and civic life.', url: 'https://www.vfw.org/community/community-initiatives' },
    { name: 'Still Serving and Day of Service', line: 'Veterans and families giving back to their communities.', url: 'https://www.vfw.org/community/stillserving' },
    { name: 'Troop support', line: 'Military Appreciation Program and Adopt-a-Unit.', url: 'https://www.vfw.org/community/troop-support' },
  ],
  outreach: [
    { name: 'Free VA claims help', line: 'VFW Service Officers are accredited and free.', url: 'https://www.vfw.org/assistance/va-claims-separation-benefits' },
    { name: 'Financial assistance', line: 'Grants for service members, paid to creditors.', url: 'https://www.vfw.org/assistance/financial-grants' },
    { name: 'Mental wellness', line: 'Veterans Crisis Line, Vet Centers and more.', url: 'https://www.vfw.org/assistance/mental-wellness' },
    { name: 'Student veterans support', line: 'Sport Clips Help A Hero Scholarship for student veterans.', url: 'https://www.vfw.org/assistance/student-veterans-support' },
  ],
};

// [year, text, source url]
export const NATIONAL_TIMELINE = [
  ['1899', 'Veterans of the Spanish-American War meet in Columbus, Ohio on September 29 and form the American Veterans of Foreign Service. Similar groups form in Denver, Colorado and Altoona, Pennsylvania.', 'https://www.vfw.org/media-and-events/latest-releases/archives/2024/9/vfw-was-born-of-battle'],
  ['1914', 'According to the VFW history page, the group takes the name Veterans of Foreign Wars of the U.S.', 'https://www.vfw.org/vfw126'],
  ['1917', 'The VFW helps shape changes to the War Risk Insurance Act.', 'https://www.vfw.org/media-and-events/latest-releases/archives/2024/9/vfw-was-born-of-battle'],
  ['1919', 'The National Service Bureau is created. It is now the VFW National Veterans Service.', 'https://www.vfw.org/media-and-events/latest-releases/archives/2024/9/vfw-was-born-of-battle'],
  ['1922', 'The first national Buddy Poppy distribution.', 'https://www.vfw.org/community/community-initiatives/buddy-poppy'],
  ['1936', 'According to the VFW history page, Congress chartered the VFW on May 28.', 'https://www.vfw.org/vfw126'],
  ['1944', 'The VFW helps win passage of the GI Bill of Rights.', 'https://www.vfw.org/media-and-events/latest-releases/archives/2024/9/vfw-was-born-of-battle'],
  ['2024', 'The VFW marks its 125th anniversary.', 'https://www.vfw.org/media-and-events/latest-releases/archives/2024/9/vfw-was-born-of-battle'],
];

export const DISCOUNTS_CHECKED = 'October 2026';
