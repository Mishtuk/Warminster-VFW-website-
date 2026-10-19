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
  hours: null, // not published anywhere we could verify: pages show "call the post"
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
  // Business listing name (research-web.md section 4)
  listingName: 'Douglas A. Post - Harry C. Wilson II Memorial Post',
};
POST.address = `${POST.street}, ${POST.city}, ${POST.region} ${POST.zip}`;
POST.tel = `tel:+1${POST.phone.replace(/\D/g, '')}`;
POST.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(POST.address)}`;
POST.callText = `Call the post ${POST.phone}`;
