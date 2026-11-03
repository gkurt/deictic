import { defineConfig } from '@rspack/cli';
import { rspack } from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';
import { tailwind } from 'deictic/tailwind';
import { DeicticPlugin } from 'deictic/webpack';

const dev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  mode: dev ? 'development' : 'production',
  entry: './src/main.tsx',
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: { syntax: 'typescript', tsx: true },
            transform: { react: { runtime: 'automatic', development: dev, refresh: dev } },
          },
        },
      },
    ],
  },
  plugins: [
    // In development mode: marks every element with its place in the source, and serves deictic's
    // endpoints on the dev server. Alt-click an element to open the popup there.
    new DeicticPlugin({ plugins: [tailwind()] }),
    new rspack.HtmlRspackPlugin({ template: './index.html' }),
    dev && new ReactRefreshRspackPlugin(),
  ],
  devServer: { port: 5182 },
});
