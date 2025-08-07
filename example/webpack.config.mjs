import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname equivalent for ES Modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  entry: {
    app: path.resolve(__dirname, './src/app.js'),
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.bpmn$/i,
        type: 'asset/source'
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [ 'babel-loader' ],
      },
      {
        test: /\.css$/i,
        use: [
          process.env.NODE_ENV !== 'production'
              ? 'style-loader'
              : MiniCssExtractPlugin.loader,
          'css-loader'
        ],
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
    ...(process.env.NODE_ENV === 'production'
            ? [ new MiniCssExtractPlugin({
              filename: '[name].css'
            }) ]
            : []
    )
  ],
  devtool: process.env.NODE_ENV === 'production'
      ? false
      : 'eval-source-map',
  devServer: {
    hot: false,
    liveReload: false,
    static: {
      directory: path.join(__dirname, 'dist'), // Modern devServer syntax
    },
  },
  mode: process.env.NODE_ENV || 'development', // Explicit mode setting
  optimization: {
    moduleIds: 'deterministic', // Better build caching
  }
};