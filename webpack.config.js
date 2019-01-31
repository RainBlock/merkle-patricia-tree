const path = require('path');

module.exports = {
    mode: "production",
    entry: "./src/index.ts",
    output: {
        filename: "[name].bundle.js",
        path: path.resolve(__dirname, 'dist'),
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"]
      },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: "ts-loader"
            },
        ]
    },
};