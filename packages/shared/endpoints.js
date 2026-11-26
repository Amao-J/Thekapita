
export const ENDPOINTS = Object.freeze({
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    google: '/auth/google',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
  },
  profile: {
    me: '/profile/me',
    preferences: '/profile/preferences',
    settings: '/profile/settings',
  },
  wallet: {
    balance: '/wallet/balance',
    analytics: '/wallet/analytics',
    fund: '/wallet/fund',
    send: '/wallet/send',
    transactions: '/wallet/transactions',
    beneficiaries: '/wallet/beneficiaries',
  },
  routing: {
    route: '/routing/route', // GET ?from_lat&from_lng&to_lat&to_lng -> road distance, traffic-aware ETA, polyline
  },
  rides: {
    book: '/rides/book',
    detail: (ref) => `/rides/${encodeURIComponent(ref)}`,
    cancel: (ref) => `/rides/${encodeURIComponent(ref)}/cancel`,
  },
  driver: {
    me: '/driver/me',
    register: '/driver/register',
    status: '/driver/status',
    location: '/driver/location',
    active: '/driver/active',
    rides: '/driver/rides',
    summary: '/driver/summary',
    arrived: (ref) => `/driver/rides/${encodeURIComponent(ref)}/arrived`,
    start: (ref) => `/driver/rides/${encodeURIComponent(ref)}/start`,
    complete: (ref) => `/driver/rides/${encodeURIComponent(ref)}/complete`,
  },
  food: {
    restaurants: '/food/restaurants',
    restaurant: (slug) => `/food/restaurants/${encodeURIComponent(slug)}`,
    deliveryEstimate: (slug) => `/food/restaurants/${encodeURIComponent(slug)}/delivery-estimate`, // GET ?lat&lng (signed in)
    orders: '/food/orders',
    confirmOrder: (ref) => `/food/orders/${encodeURIComponent(ref)}/confirm`,
    cancelOrder: (ref) => `/food/orders/${encodeURIComponent(ref)}/cancel`,
    reservations: '/food/reservations',
    cancelReservation: (ref) => `/food/reservations/${encodeURIComponent(ref)}/cancel`,
    vendor: {
      me: '/food/vendor/me',
      register: '/food/vendor/register',
      store: '/food/vendor/store',
      summary: '/food/vendor/summary',
      menu: '/food/vendor/menu',
      menuItem: (id) => `/food/vendor/menu/${id}`,
      storeImageUploadUrl: '/food/vendor/store/image/upload-url',
      storeImage: '/food/vendor/store/image',
      dishImageUploadUrl: (id) => `/food/vendor/menu/${id}/image/upload-url`,
      dishImage: (id) => `/food/vendor/menu/${id}/image`,
      orders: '/food/vendor/orders',
      orderStatus: (ref) => `/food/vendor/orders/${encodeURIComponent(ref)}/status`,
    },
  },
  directory: {
    listings: '/directory/listings',
    listing: (id) => `/directory/listings/${id}`,
    listingImage: (id) => `/directory/listings/${id}/image`,
    listingImageUploadUrl: (id) => `/directory/listings/${id}/image/upload-url`,
    search: '/directory/search',
    reviews: (id) => `/directory/listings/${id}/reviews`,
    bookmark: (id) => `/directory/listings/${id}/bookmark`,
    bookmarks: '/directory/bookmarks',
    mine: '/directory/mine',
    reports: '/directory/reports',
  },
  haven: {
    properties: '/haven/properties', // GET (public, live only; ?intent&category&q&city&min_price&max_price&bedrooms) / POST (signed in)
    property: (id) => `/haven/properties/${id}`, // GET / PATCH / DELETE (owner)
    mine: '/haven/mine',
    bookmarks: '/haven/bookmarks',
    bookmark: (id) => `/haven/properties/${id}/bookmark`, // POST / DELETE
  },
});
