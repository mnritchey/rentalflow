const path = require('path');
const fs = require('fs');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  module: {
    rules: [
      { test: /\.(js|jsx)$/, use: 'babel-loader', exclude: /node_modules/ },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] }
    ]
  },
  resolve: { extensions: ['.js', '.jsx'] },
  plugins: [
    {
      apply(compiler) {
        compiler.hooks.afterEmit.tap('CopyHTML', () => {
          const src = path.resolve(__dirname, 'public/index.html');
          const dst = path.resolve(__dirname, 'dist/index.html');
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
          console.log('Copied index.html to dist/');
        });
      }
    }
  ],
  devServer: {
    historyApiFallback: true,
    port: 8080,
    proxy: [{ context: ['/api', '/ws'], target: 'http://localhost:3000', ws: true }]
  }
};
