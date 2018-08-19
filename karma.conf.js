process.env.ethTest = 'TrieTests'

module.exports = function (config) {
  config.set({
    browserNoActivityTimeout: 120000,
    frameworks: ['mocha', 'detectBrowsers'],
    files: [
      './src/*.spec.ts'
    ],
    preprocessors: {
      './src/*.spec.ts': ['webpack', 'env']
    },
    webpack : {
      mode: "production",
      devtool: 'inline-source-map',
      module: {
          // Suppress warning from mocha: "Critical dependency: the request of a dependency is an expression"
          // @see https://webpack.js.org/configuration/module/#module-contexts
          exprContextCritical: false,
          rules: [
              {
                  test: /\.ts$/,
                  loader: "ts-loader"
              },
          ],
      },
      // Suppress fatal error: Cannot resolve module 'fs'
      // @relative https://github.com/pugjs/pug-loader/issues/8
      // @see https://github.com/webpack/docs/wiki/Configuration#node
      node: {
        fs: 'empty',
      },
      resolve: {
        extensions: ['.ts', '.js', '.json']
      }
    },
    singleRun: true,
    reporters: ['mocha'],
    plugins: [
      'karma-chrome-launcher',
      'karma-env-preprocessor',
      'karma-firefox-launcher',
      'karma-detect-browsers',
      'karma-webpack',
      'karma-mocha',
      'karma-mocha-reporter'
    ],
    mime: {
      'text/x-typescript': ['ts','tsx']
    },
    detectBrowsers: {
      enabled: true,
      usePhantomJS: false,
      postDetection: function (availableBrowser) {
        if (process.env.TRAVIS) {
          return ['Firefox']
        }

        var browsers = ['Chrome', 'Firefox']
        return browsers.filter(function (browser) {
          return availableBrowser.indexOf(browser) !== -1
        })
      }
    }
  })
}
