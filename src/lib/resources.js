import { POST } from './post.js';
// Outside-world content for /resources, /programs and /history. Every entry traces to docs/research.md.
// need: health | benefits | money (the groups on /resources)
export const BENEFITS = [
  { need: 'benefits', name: 'VA.gov', line: 'Benefits, health care and how to apply.', url: 'https://www.va.gov' },
  { need: 'benefits', name: 'VFW free claims help', line: 'Accredited VFW Service Officers help with VA claims at no cost.', url: 'https://www.vfw.org/assistance/va-claims-separation-benefits' },
  { need: 'benefits', name: 'Start a claim with the VFW', line: 'Begin a VA claim online with VFW support.', url: 'https://claims.vfw.org' },
  { need: 'money', name: 'VFW financial assistance', line: 'Grants for service members, paid to creditors.', url: 'https://www.vfw.org/assistance/financial-grants' },
  { need: 'benefits', name: 'PA Dept. of Military and Veterans Affairs', line: 'State programs, including the Veterans Trust Fund and PA VETConnect.', url: 'https://www.pa.gov/agencies/dmva' },
  { need: 'benefits', name: 'Bucks County Military and Veterans Affairs', line: '55 East Court St, Doylestown, PA 18901. Phone 215-345-3307. Call to confirm hours.', url: 'https://buckscounty.gov/Directory.aspx?DID=87' },
  { need: 'health', name: 'Vet Centers', line: 'Readjustment counseling for veterans and families.', url: 'https://www.vetcenter.va.gov/' },
  { need: 'health', name: 'VA mental health', line: 'Mental health care and support from the VA.', url: 'https://www.mentalhealth.va.gov/' },
  { need: 'health', name: 'Corporal Michael J. Crescenz VA Medical Center', line: '3900 Woodland Ave, Philadelphia, PA 19104.', url: 'https://www.va.gov/philadelphia-health-care/locations/' },
  { need: 'benefits', name: 'VFW Find a Post', line: 'Locate other VFW posts and what they offer.', url: 'https://www.vfw.org/find-a-post' },
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
    { name: 'Voice of Democracy', line: 'Audio essay contest for grades 9 to 12.', url: 'https://www.vfw.org/community/youth-and-education/youth-scholarships' },
    { name: "Patriot's Pen", line: 'Essay contest for grades 6 to 8, 300 to 400 words.', url: 'https://www.vfw.org/community/youth-and-education/youth-scholarships' },
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

// What Post 6493 itself does (from the post's Facebook group), sorted into the three pillars.
export const POST_DOES = {
  service: [
    'The post gives $1,000 every year to the Warminster Food Bank. Food collection boxes are at the rear door.',
    'Christmas toy drives with the Knights of the Inferno (Apollo Chapter), in 2023 and 2024, and a Brad Fox Foundation trivia night for Toys for Tots.',
    'The Auxiliary prepared 50 Easter baskets for F.E.A.S.T. in spring 2025.',
    'Worn flags can be dropped in the blue receptacle at the rear door, left side. In June 2026 the post held a flag retirement ceremony with Scout Troop 139.',
    'Post named #1 in the nation for community service by VFW National HQ (posted in the Facebook group, December 2023).',
    'Won the Pennsylvania "Working Together Excellence Award" at the Gettysburg convention (about June 2025).',
  ],
  outreach: [
    "Flags placed on veterans' graves at Sunset Memorial Park every Armed Forces Day.",
    'Buddy Poppy sales, with the money going to veterans in need.',
    "Auxiliary volunteers at the Delaware Valley Veterans Home. The Auxiliary's hospital program received the Citation of Excellence, Outstanding Hospital of the Year, from the PA Auxiliary.",
    'Memorial Day ceremony each year, and a free veterans and military brunch (June 2024).',
    "A Veteran Muster (October 2025), and veterans service hours with elected officials' offices at the post (May 2025).",
  ],
  youth: [
    "Voice of Democracy (grades 9 to 12) and Patriot's Pen (grades 6 to 8). The deadline is October 31, 2026 (2026-27 contest).",
    'The post sponsors youth teams: Hatboro Little League, Warrington-Warwick Softball, Centennial, Hatboro and Warwick baseball, and Warminster Spartans Youth Wrestling.',
    'Cub Scout Pack 139 holds events at the post, including its spring craft fair, and the post works with Scout Troop 139.',
  ],
};

// ---------- Round 3: first-visit guides, youth contests, Support the Post, volunteer jobs, help kinds ----------
// Sources: docs/research.md and the post's Facebook group. No times or prices here: those come from the events data.
export const HELP_KINDS = {
  ride: 'A ride to a VA appointment',
  visit: 'A visit or a phone call',
  benefits: 'Help with VA benefits or a claim',
  other: 'Something else',
};

export const GUIDES = [
  { id: 'bingo', name: 'Thursday Bingo', cat: 'auxiliary',
    happens: ['The Auxiliary runs bingo on Thursday nights.', 'It is open to the public. You do not need to be a member.', 'Admission covers your bingo boards. This week\'s price is in the list below.'],
    good: ['The kitchen opens before bingo on Thursday evenings. The menu is on The Bar page.', 'Parking, age rules and what to bring: call the post.'] },
  { id: 'line-dancing', name: 'Line dancing', cat: 'bar',
    happens: ['A DJ, Shotgun Jenny, plays the music, with a lesson before the dancing starts.', 'It is every Monday except the second Monday, which is meeting night.', 'It is open to the public.'],
    good: ['Some nights have a theme, like an 80s night or a Halloween costume contest.', 'The kitchen is open on Monday evenings.', 'Shoes, beginner steps, parking and age rules: call the post.'] },
  { id: 'watch-parties', name: 'Game-day watch parties', cat: 'bar',
    happens: ['The big-screen TV shows the Eagles, Phillies, Flyers, Sixers and Union.', 'There are food and drink specials on game days.', 'On some Sundays, guests bring a dish to share.'],
    good: ['The bar is for members and guests, and membership cards are checked.'] },
];

export const FIRST_VISIT_FAQ = [
  ['Do I need to be a member?', `Not for events marked Open to the Public: ${POST.publicNights.join(', ')}. The bar itself is for members and guests, and membership cards are checked. Joining is open to veterans and non-veterans.`],
  ['Is there food?', 'Yes. A caterer runs the kitchen on set evenings. The menu and the kitchen hours are on The Bar page.'],
  ['Can I bring a guest?', 'Members may bring guests to the bar. For how a guest signs in, call the post.'],
];

export const YOUTH = {
  deadline: '2026-10-31', // the contest's yearly deadline; change it here when VFW National announces the next one
  rules: 'https://www.vfw.org/community/youth-and-education/youth-scholarships',
  contests: [
    { name: 'Voice of Democracy', rows: [
      ['Grades', '9 to 12'], ['Theme this year', 'What a Veteran Taught Me About America'], ['Format', 'A recorded audio essay'],
      ['Prizes', 'National first prize of $35,000, paid to the school, and other national scholarships up to $21,000. State winners get at least $1,000 and a trip to the Spirit of America program at Valley Forge.'],
    ] },
    { name: "Patriot's Pen", rows: [
      ['Grades', '6 to 8'], ['Theme this year', 'What a Veteran Taught Me About America'], ['Format', 'A written essay of 300 to 400 words'],
      ['Prizes', 'National first prize of $5,000. Each state first-place winner gets at least $500 at the national level.'],
    ] },
  ],
  scholarships: [
    { name: 'Sport Clips Help A Hero Scholarship', line: 'Up to $5,000 for a qualified student veteran with financial need. Spring applications run August 1 to November 15.', host: 'VFW', url: 'https://www.vfw.org/assistance/student-veterans-support' },
    { name: 'Voice of Democracy and Patriot\'s Pen scholarships', line: 'National scholarships from the contests above.', host: 'VFW', url: 'https://www.vfw.org/community/youth-and-education/youth-scholarships' },
    { name: 'Scout of the Year', line: 'A yearly VFW honor for Scouts, Girl Scouts, Sea Scouts and Venturing youth.', host: 'VFW', url: 'https://www.vfw.org/community/youth-and-education/scout-of-the-year' },
  ],
  winners: [], // [{ year, name, school, contest }] only with a parent's written permission
};

export const SUPPORT = {
  national: [
    { name: 'VFW donate page', line: 'Give to the VFW nationally.', url: 'https://www.vfw.org/donate' },
    { name: 'Buddy Poppy', line: 'Poppy donations fund veteran relief.', url: 'https://www.vfw.org/community/community-initiatives/buddy-poppy' },
    { name: 'Unmet Needs', line: 'Financial grants for service members and families.', url: 'https://www.vfw.org/assistance/financial-grants' },
  ],
  drives: [
    ['All year', 'Food for the Warminster Food Bank', 'Collection boxes are at the rear door. The post gives $1,000 a year to the food bank.'],
    ['Late May', 'Buddy Poppy sales', 'Poppies were sold at ShopRite Warminster on May 25, 2025. The money goes to veterans in need.'],
    ['Spring', 'Easter baskets', 'The Auxiliary prepared 50 baskets for F.E.A.S.T. in spring 2025.'],
    ['Fall', 'Blood drive', 'Red Cross blood drives were held at the post in October 2024 and on September 12, 2025.'],
    ['Late fall', 'Toys for Tots trivia night', 'The Brad Fox Foundation trivia night was held on November 23, 2024, and again in October 2025.'],
    ['Winter', 'Toy drive and coat drive', 'Christmas toys were gathered with the Knights of the Inferno, Apollo Chapter, in 2023 and December 2024. The post also shares the Coats for Homeless Veterans drive.'],
  ],
  fundraisers: [
    ['Cash Bash', 'The Auxiliary\'s yearly night of prizes and drawings.'],
    ['Thursday Bingo', 'Run by the Auxiliary every Thursday.'],
    ['Red Day apparel', 'The Auxiliary sold Red Day shirts in January 2026.'],
    ['Cookie Exchange', 'Held in December 2024 and December 2025.'],
    ['Chili cook-off', 'Held in November 2025.'],
  ],
};

export const VOLUNTEER_JOBS = [
  ['Flags on veterans\' graves', 'Every year around Armed Forces Day at Sunset Memorial Park.'],
  ['Memorial Day', 'The ceremony at the post flagpole, the cemetery visits and the parade.'],
  ['Poppy sales', 'Selling Buddy Poppies for veterans in need, as at ShopRite in May 2025.'],
  ['Drives', 'Collecting food, toys and coats, and helping at the Toys for Tots trivia night.'],
  ['Veterans home visits', 'Auxiliary volunteers visit the Delaware Valley Veterans Home.'],
  ['Flag retirement', 'A ceremony with Scout Troop 139, held in June 2026.'],
];
