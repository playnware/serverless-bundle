const path = require("path");
const webpack = require("webpack");
const slsw = require("serverless-webpack");
const HardSourceWebpackPlugin = require("hard-source-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const ConcatTextPlugin = require("concat-text-webpack-plugin");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const fs = require("fs");

const config = require("./config");
const jsEslintConfig = require("./eslintrc.json");
const tsEslintConfig = require("./ts.eslintrc.json");
const ignoreWarmupPlugin = require("./ignore-warmup-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

const isLocal = slsw.lib.webpack.isLocal;

const servicePath = config.servicePath;
const nodeVersion = config.nodeVersion;
const copyFiles = config.options.copyFiles;
const concatText = config.options.concatText;
const ignorePackages = config.options.ignorePackages;
const tsConfigPath = path.resolve(servicePath, "./tsconfig.json");
const fixPackages = convertListToObject(config.options.fixPackages);

const ENABLE_TYPESCRIPT = fs.existsSync(tsConfigPath);
const ENABLE_STATS = config.options.stats;
const ENABLE_LINTING = config.options.linting;
const ENABLE_SOURCE_MAPS = config.options.sourcemaps;
const ENABLE_CACHING = isLocal ? config.options.caching : false;

function convertListToObject(list) {
  var object = {};

  for (var i = 0, l = list.length; i < l; i++) {
    object[list[i]] = true;
  }

  return object;
}

function resolveEntriesPath(entries) {
  for (let key in entries) {
    entries[key] = path.join(servicePath, entries[key]);
  }

  return entries;
}

function babelLoader() {
  const plugins = [
    "@babel/plugin-transform-runtime",
    "@babel/plugin-proposal-class-properties"
  ];

  if (ENABLE_SOURCE_MAPS) {
    plugins.push("babel-plugin-source-map-support");
  }

  return {
    loader: "babel-loader",
    options: {
      // Enable caching
      cacheDirectory: ENABLE_CACHING,
      // Disable compresisng cache files to speed up caching
      cacheCompression: false,
      plugins: plugins.map(require.resolve),
      presets: [
        [
          require.resolve("@babel/preset-env"),
          {
            targets: {
              node: nodeVersion
            }
          }
        ]
      ],
    }
  };
}

function eslintLoader() {
  return {
    loader: "eslint-loader",
    options: {
      baseConfig: jsEslintConfig
    }
  };
}

function tsLoader() {
  return {
    loader: "ts-loader",
    options: {
      transpileOnly: true,
      experimentalWatchApi: true
    }
  };
}

function loaders() {
  const loaders = {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [babelLoader()]
      },
      {
        test: /\.(graphql|gql)$/,
        exclude: /node_modules/,
        loader: "graphql-tag/loader"
      }
    ]
  };

  if (ENABLE_TYPESCRIPT) {
    loaders.rules.push({
      test: /\.ts$/,
      use: [babelLoader(), tsLoader()],
      exclude: [
        [
          path.resolve(servicePath, "node_modules"),
          path.resolve(servicePath, ".serverless"),
          path.resolve(servicePath, ".webpack")
        ]
      ]
    });
  }

  if (ENABLE_LINTING) {
    loaders.rules[0].use.push(eslintLoader());
  }

  return loaders;
}

function plugins() {
  const plugins = [];

  if (ENABLE_TYPESCRIPT) {
    const forkTsCheckerWebpackOptions = {
      tsconfig: path.resolve(servicePath, "./tsconfig.json")
    };

    if (ENABLE_LINTING) {
      forkTsCheckerWebpackOptions.eslint = true;
      forkTsCheckerWebpackOptions.eslintOptions = {
        baseConfig: tsEslintConfig
      };
    }

    plugins.push(new ForkTsCheckerWebpackPlugin(forkTsCheckerWebpackOptions));
  }

  if (ENABLE_CACHING) {
    plugins.push(
      new HardSourceWebpackPlugin({
        info: {
          mode: ENABLE_STATS ? "test" : "none",
          level: ENABLE_STATS ? "debug" : "error"
        }
      })
    );
  }

  if (copyFiles) {
    plugins.push(
      new CopyWebpackPlugin(
        copyFiles.map(function(data) {
          return {
            to: data.to,
            context: servicePath,
            from: path.join(servicePath, data.from)
          };
        })
      )
    );
  }

  if (concatText) {
    const concatTextConfig = {};

    concatText.map(function(data) {
      concatTextConfig.files = data.files || null;
      concatTextConfig.name = data.name || null;
      concatTextConfig.outputPath = data.outputPath || null;
    });

    plugins.push(new ConcatTextPlugin(concatTextConfig));
  }

  // Ignore all locale files of moment.js
  plugins.push(new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/));

  // Ignore any packages specified in the `ignorePackages` option
  for (let i = 0, l = ignorePackages.length; i < l; i++) {
    plugins.push(
      new webpack.IgnorePlugin(new RegExp("^" + ignorePackages[i] + "$"))
    );
  }

  if (fixPackages["formidable@1.x"]) {
    plugins.push(new webpack.DefinePlugin({ "global.GENTLY": false }));
  }

  return plugins;
}

module.exports = ignoreWarmupPlugin({
  entry: resolveEntriesPath(slsw.lib.entries),
  target: "node",
  context: __dirname,
  // Disable verbose logs
  stats: ENABLE_STATS ? "normal" : "errors-only",
  devtool: ENABLE_SOURCE_MAPS ? "source-map" : false,
  // Exclude "aws-sdk" since it's a built-in package
  externals: ["aws-sdk", "knex", "sharp"],
  mode: isLocal ? "development" : "production",
  performance: {
    // Turn off size warnings for entry points
    hints: false
  },
  resolve: {
    alias: {
      lib: path.resolve(__dirname, 'lib'),
    },
    // Performance
    symlinks: false,
    extensions: [".wasm", ".mjs", ".js", ".json", ".ts", ".graphql", ".gql"],
    // First start by looking for modules in the plugin's node_modules
    // before looking inside the project's node_modules.
    modules: [path.resolve(__dirname, "node_modules"), "node_modules"],
    // thanks https://blog.johnnyreilly.com/2018/08/killing-relative-paths-with-typescript-and.html
    plugins: [
      new TsconfigPathsPlugin({
        configFile: "./../../tsconfig.json"
      })
    ]
  },
  // Add loaders
  module: loaders(),
  // PERFORMANCE ONLY FOR DEVELOPMENT
  optimization: isLocal
    ? {
        splitChunks: false,
        removeEmptyChunks: false,
        removeAvailableModules: false
      }
    : // Don't minimize in production
      // Large builds can run out of memory
      { minimize: false },
  plugins: plugins(),
  node: {
    __dirname: false
  }
});
