/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    webpack: (config, { isServer }) => {
        // Enable WebAssembly
        config.experiments = {
            ...config.experiments,
            asyncWebAssembly: true,
        };

        // Fix for WebAssembly modules
        config.module.rules.push({
            test: /\.wasm$/,
            type: "webassembly/async",
        });

        return config;
    },
};

module.exports = nextConfig;
