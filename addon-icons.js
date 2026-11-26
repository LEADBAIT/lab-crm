/* Icons for add-ons and services, in the same style as the media icons (viewBox 44×34, same palette).
   Shared by the quote page (p.html), the questionnaire (q.html) and the CRM price list.
   Keyed by products.id; a product without its own icon gets the gift box. A product picture (image_path) always wins. */
'use strict';
const ADDON_IC = (() => {
  const usb = '<rect x="4" y="10" width="26" height="14" rx="3" fill="#22324A"/><rect x="30" y="12" width="10" height="10" fill="#8C96A3"/><rect x="33" y="14.5" width="2.2" height="2.2" fill="#fff"/><rect x="36.5" y="14.5" width="2.2" height="2.2" fill="#fff"/><rect x="8" y="14" width="13" height="6" rx="1" fill="#EADFC2"/><circle cx="25" cy="17" r="1.8" fill="#FFB21E"/>';
  const truck = box => `<path d="M2 9h22v15H2z" fill="#22324A"/><path d="M24 13h8l6 6v5H24z" fill="#59616E"/><path d="M26 15h5l4 4h-9z" fill="#8AB4F8"/>${box}<circle cx="9" cy="25" r="3.6" fill="#1B1F27"/><circle cx="9" cy="25" r="1.5" fill="#FFB21E"/><circle cx="31" cy="25" r="3.6" fill="#1B1F27"/><circle cx="31" cy="25" r="1.5" fill="#FFB21E"/>`;
  const parcel = '<rect x="7" y="12" width="12" height="9" fill="#EADFC2"/><path d="M13 12v9" stroke="#D9940F" stroke-width="1.6"/>';
  const cloud = '<path d="M12 27a7 7 0 0 1-.6-14 9 9 0 0 1 17.3-2.2A7.6 7.6 0 1 1 32 27z" fill="#C9D1DB" stroke="#8C96A3"/>';
  return {
    11: usb, 12: usb, 22: usb,
    // return shipping: truck with the box going back (arrow)
    13: truck(parcel) + '<path d="M40 6h-9m0 0 3-3m-3 3 3 3" stroke="#1F6F5C" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    // express: stopwatch with a lightning bolt
    14: '<circle cx="22" cy="19" r="13" fill="#1B1F27"/><circle cx="22" cy="19" r="10.5" fill="#EADFC2"/><rect x="19.5" y="2" width="5" height="4" rx="1" fill="#59616E"/><path d="M24 9 16 21h5l-2 8 9-12h-5z" fill="#FFB21E" stroke="#1B1F27" stroke-width="1" stroke-linejoin="round"/>',
    // hand film viewer / projector: body, lens, film reel on top
    15: '<rect x="8" y="14" width="22" height="14" rx="2" fill="#22324A"/><circle cx="14" cy="9" r="6" fill="#59616E"/><circle cx="14" cy="9" r="2" fill="#1B1F27"/><path d="M30 17h5l5-3v14l-5-3h-5z" fill="#8C96A3"/><circle cx="19" cy="21" r="3" fill="#FFB21E"/><rect x="12" y="28" width="5" height="4" fill="#1B1F27"/>',
    // online memories page: browser window with a photo and a heart
    16: '<rect x="3" y="3" width="38" height="28" rx="2" fill="#fff" stroke="#8C96A3"/><rect x="3" y="3" width="38" height="6" rx="2" fill="#C9D1DB"/><circle cx="7" cy="6" r="1.1" fill="#C42A2A"/><circle cx="10.5" cy="6" r="1.1" fill="#FFB21E"/><rect x="7" y="12" width="16" height="15" fill="#8AB4F8"/><path d="M7 27l5-6 4 4 3-2 4 4z" fill="#1F6F5C"/><path d="M32 25c-5-3.5-6-6-6-7.5a3 3 0 0 1 6-.6 3 3 0 0 1 6 .6c0 1.5-1 4-6 7.5z" fill="#C42A2A"/>',
    // help uploading to the customer's cloud: cloud with an up arrow
    17: cloud + '<path d="M22 24V14m0 0-4 4m4-4 4 4" stroke="#22324A" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    // free courier pickup: truck carrying the customer's box to the lab
    24: truck(parcel), 25: truck(parcel),
    // cloud backup for a year: cloud with a green check
    26: cloud + '<path d="M17 19l4 4 7-8" stroke="#1F6F5C" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    // tape repair: cassette with a wrench
    10: '<rect x="2" y="6" width="34" height="20" rx="2" fill="#1B1F27"/><rect x="5" y="9" width="28" height="5" fill="#EADFC2"/><circle cx="12" cy="19" r="3.5" fill="#FFB21E"/><circle cx="26" cy="19" r="3.5" fill="#FFB21E"/><path d="M30 31l9-9a4 4 0 1 0-3-3l-9 9z" fill="#8C96A3" stroke="#1B1F27" stroke-width="1"/>',
    gift: '<rect x="8" y="14" width="28" height="17" rx="1.5" fill="#22324A"/><rect x="6" y="9" width="32" height="6" rx="1" fill="#D9940F"/><rect x="20" y="9" width="4" height="22" fill="#FFB21E"/><path d="M22 9c-3-6-9-5-8-2s8 2 8 2zm0 0c3-6 9-5 8-2s-8 2-8 2z" fill="none" stroke="#D9940F" stroke-width="1.8"/>',
  };
})();
/** inline SVG for an add-on, or '' when there is no icon for it and no fallback is wanted */
const addonIcon = (id, fallback = true) => {
  const k = ADDON_IC[id] ? id : id === 'usb' ? 11 : fallback ? 'gift' : null;
  return k == null ? '' : `<svg viewBox="0 0 44 34" aria-hidden="true">${ADDON_IC[k]}</svg>`;
};
