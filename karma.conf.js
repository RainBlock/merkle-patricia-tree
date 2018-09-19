
module.exports = function (config) {
  const configuration = {
    browserNoActivityTimeout: 120000,
    frameworks: ['mocha'],
    files: [
      './src/*.spec.ts',
      {pattern: './test/*.*', watched: false, included: false, served: true, nocache: false}
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
      'karma-webpack',
      'karma-mocha',
      'karma-mocha-reporter'
    ],
    mime: {
      'text/x-typescript': ['ts','tsx']
    },
    browsers: ['Chrome'],
    customLaunchers: {
      Chrome_travis_ci: {
        base: 'Chrome',
        flags: ['--no-sandbox']
      }
    }
  };

  if(process.env.TRAVIS) {
    configuration.browsers = ['Chrome_travis_ci'];
  }

  config.set(configuration);
}
