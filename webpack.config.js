// webpack.config.js
const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development',
    target: 'web',
    devtool: false,
    
    
    entry: {
        'background/service-worker': './background/service-worker.js',
        'offscreen/offscreen': './offscreen/offscreen.js',
        'popup/popup': './popup/popup.js',
        'pages/manageDids': './pages/manageDids.js',
        'pages/messages': './pages/messages.js',
        'pages/form-display': './pages/form-display.js',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        clean: true,
    },
    optimization: {
        minimize: false,
        minimizer: [],
        splitChunks: false,
        runtimeChunk: false,
    },
    resolve: {
        extensions: ['.js'],
        fallback: {
            "assert": require.resolve("assert/"), "buffer": require.resolve("buffer/"),
            "constants": require.resolve("constants-browserify"), "crypto": require.resolve("crypto-browserify"),
            "http": require.resolve("stream-http"), "https": require.resolve("https-browserify"),
            "os": require.resolve("os-browserify/browser"), "path": require.resolve("path-browserify"),
            "querystring": require.resolve("querystring-es3"), "stream": require.resolve("stream-browserify"),
            "url": require.resolve("url/"), "util": require.resolve("util/"),
            "zlib": require.resolve("browserify-zlib"), "child_process": false, "fs": false,
            "module": false, "worker_threads": false, "inspector": false, "vm": false,
        }
    },
    plugins: [
        // ProvidePlugin is removed to prevent global pollution.
        new CopyPlugin({
            patterns: [
                { from: "manifest.json", to: "." },
                { from: "offscreen/offscreen.html", to: "offscreen/" },
                { from: "popup/popup.html", to: "popup/" },
                { from: "pages/manageDids.html", to: "pages/" },
                { from: "pages/messages.html", to: "pages/" },
                { from: "pages/form-display.html", to: "pages/" },
                { from: "icons", to: "icons/" },
                { from: "popup/popup.css", to: "popup/" },
                { from: "pages/manageDids.css", to: "pages/" },
                { from: "pages/messages.css", to: "pages/" },
            ],
        }),
    ],
};