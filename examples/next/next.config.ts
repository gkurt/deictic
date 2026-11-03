import { withDeictic } from 'deictic/next';
import { tailwind } from 'deictic/tailwind';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

// In `next dev`, marks every element with its place in the source, server components' too, and
// serves deictic's endpoints: Alt-click an element to open the popup there.
export default withDeictic(nextConfig, { plugins: [tailwind()] });
