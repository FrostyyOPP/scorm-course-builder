/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false,
  // allow importing the shared ESM review-state lib from outside app/
  experimental: { externalDir: true },
};
