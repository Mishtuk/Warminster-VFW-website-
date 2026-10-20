// Every fact about the post lives here (sources: docs/research.md). Pages import from this file, never hard-code.
// Unknown = null: pages then say "Call the post".
export const POST = {
  name: 'VFW Post 6493 & Auxiliary',
  short: 'VFW Post 6493',
  city: 'Warminster',
  region: 'PA',
  street: '645 Louis Dr',
  zip: '18974',
  phone: '215-773-0693',
  motto: 'No One Does More for Veterans',
  facebook: 'https://www.facebook.com/groups/845409237204566/',
  membership: 'Membership is open to veterans and non-veterans. Ask for details.',
  // Bar (canteen) hours from the post's flyer, 2026
  hours: [['Monday to Thursday', '5 PM to 10 PM'], ['Friday', '4 PM to 12 AM'], ['Saturday', '6 PM to 12 AM'], ['Sunday', '1 PM to 7 PM']],
  email: 'vfwpost6493@gmail.com',
  hallEmail: 'VFW6493HallRental@gmail.com',
  barRule: 'The bar is for members and guests. Membership cards are checked at the door.',
  joinPrice: 'Home Association (social) membership at the post is $35 a year, due December 31.',
  officeHours: 'Thursday and Friday, 8 AM to 12 PM',
  // Kitchen hours from the Aug 2026 flyer: call to confirm
  kitchen: [['Monday', '6:30 PM to 8 PM'], ['Tuesday to Thursday', '5 PM to 8 PM'], ['Friday', '5:30 PM to 8:30 PM']],
  meetings: 'The 2nd Monday of each month: Home Association 6 PM, Auxiliary 6:45 PM, VFW 7 PM.',
  publicNights: ['Thursday bingo', 'Monday line dancing', 'Friday band dances', 'Cornhole'],
  commander: 'Bill Zuk',
  auxPresident: 'Nichole Zuk',
  pastCommanders: [['Harry DeLorenzo', 'Commander for three years to July 2024, and again from October 2024'], ['John Otte', 'July to October 2024']],
  pastAuxPresident: 'Evy (Evelyn) Dobson Brennan',
  // Hall rental (hallrentalreviews.com/venue/vfw-post-6493)
  hallBlurb: 'Our Hall is always available for rent. You can supply your own food and entertainment. We have free wifi; tables and chairs are furnished and we have complete bar facilities.',
  hallSource: 'https://hallrentalreviews.com/venue/vfw-post-6493',
  hallFacts: [
    ['Free wifi', 'Included with every rental.'],
    ['Tables and chairs', 'Furnished by the post.'],
    ['Complete bar facilities', 'Full-service alcohol.'],
    ['Your food and entertainment', 'Renter supplied; staff not included.'],
    ['Setup and cleaning', 'Venue assisted.'],
  ],
  // Business listing name
  officialName: 'Veterans of Foreign Wars Warminster Memorial Post 6493',
};
POST.address = `${POST.street}, ${POST.city}, ${POST.region} ${POST.zip}`;
POST.tel = `tel:+1${POST.phone.replace(/\D/g, '')}`;
POST.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(POST.address)}`;
POST.callText = `Call the post ${POST.phone}`;
POST.hoursText = POST.hours.map(([d, h]) => `${d} ${h}`).join('. ');
POST.hallMail = `mailto:${POST.hallEmail}`;
POST.mail = `mailto:${POST.email}`;
