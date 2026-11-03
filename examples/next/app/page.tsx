import { Counter } from './counter';

// A server component: its elements are marked on the server, in the HTML it renders.
export default function Page() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">deictic on Next</h1>
      <p className="text-gray-600">Hold Alt and point at anything here, then Alt-click it.</p>
      <Counter />
    </main>
  );
}
