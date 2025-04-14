// webpack.config.js
const path = require('path'); // Needed for resolve and CopyPlugin potentially
const webpack = require('webpack');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development',
    devtool: 'cheap-module-source-map',
    entry: {
        'background/service-worker': './background/service-worker.js',
        'popup/popup': './popup/popup.js',
        'pages/manageDids': './pages/manageDids.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        clean: true,
    },
    target: 'webworker',
    resolve: {
        extensions: ['.js'],
        fallback: {
            "fs": false,
            "path": require.resolve("path-browserify"),
            "crypto": require.resolve("crypto-browserify"),
            "stream": require.resolve("stream-browserify"),
            "buffer": require.resolve("buffer/"),
            "process": require.resolve("process/browser"),
            "vm": require.resolve("vm-browserify"),
            "events": require.resolve("events/"),
            "assert": require.resolve("assert/"),
            "url": require.resolve("url/"),
            "os": require.resolve("os-browserify/browser"),
            "https": require.resolve("https-browserify"),
            "zlib": require.resolve("browserify-zlib"),
            "util": require.resolve("util/")
        }
        // No react-native aliases needed
    },
    plugins: [
        new NodePolyfillPlugin({
            excludeAliases: ["console"]
        }),
        new webpack.ProvidePlugin({
             Buffer: ['buffer', 'Buffer'],
             process: 'process/browser',
        }),
        new CopyPlugin({
            patterns: [
                { from: "manifest.json", to: "." },
                { from: "popup/popup.html", to: "popup/" },
                { from: "popup/popup.css", to: "popup/" },
                { from: "pages/manageDids.html", to: "pages/" },
                { from: "pages/manageDids.css", to: "pages/" },
                { from: "icons", to: "icons/" },
                // === ADD BACK Wasm copy ===
                {
                   from: 'node_modules/sql.js/dist/sql-wasm.wasm',
                   to: '.' // Copy to dist root
                }
                // ========================
            ],
        }),
    ],
    // === ADD BACK Wasm experiment ===
    experiments: {
         asyncWebAssembly: true,
         topLevelAwait: true // Keep if needed
    },
    // ==============================
    stats: {
        errorDetails: true
    },
    ignoreWarnings: [/Critical dependency: the request of a dependency is an expression/],
    // No Babel rules needed unless your own code requires transpilation
    // module: { rules: [] },
};