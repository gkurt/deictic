import { type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './site.css';

export const mount = (page: ReactNode) => createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>);
