import { defineConfig } from 'vite';
import { resolve } from 'path';


export default defineConfig({
  root: __dirname,
  server: {
    port: 5173,

    cors: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        auth: resolve(__dirname, 'auth.html'),
        profile: resolve(__dirname, 'profile.html'),
        wallet: resolve(__dirname, 'wallet.html'),
        marketplace: resolve(__dirname, 'marketplace.html'),
        seller: resolve(__dirname, 'seller-dashboard.html'),
        bills: resolve(__dirname, 'bills.html'),
        food: resolve(__dirname, 'food.html'),
        foodVendor: resolve(__dirname, 'food-vendor-dashboard.html'),
        ride: resolve(__dirname, 'ride.html'),
        rideActive: resolve(__dirname, 'ride-active.html'),
        rideRating: resolve(__dirname, 'ride-rating.html'),
      },
    },
  },
});
