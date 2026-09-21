import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real checkout callbacks with an SDK double; no payments are sent.
const source = readFileSync(new URL('../src/components/booking/BookingPanel.tsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('function PayPalCheckoutBox('), source.indexOf('/** The one persistent reservation summary'));
const code = ts.transpileModule(component.replace('import.meta.env.VITE_PAYPAL_CLIENT_ID', "'test-client'"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function mount(overrides = {}) {
  let options;
  const cleanups = [];
  const events = [];
  const context = {
    React: { createElement: () => null },
    useRef: (current) => ({ current }),
    useMemo: (fn) => fn(),
    useEffect: (fn) => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
    document: { getElementById: () => ({ innerHTML: '' }) },
    window: { paypal: { Buttons: (value) => {
      options = value;
      return { render: async () => {}, close: async () => { events.push('close'); } };
    } } },
    loadPayPalSdk: async () => {},
    createPayPalOrder: async () => { events.push('create'); return 'order-1'; },
    capturePayPalOrder: async () => ({ paymentStatus: 'paid' }),
    cancelPayPalOrder: async (...args) => { events.push(['cancel', ...args]); },
    getPayPalErrorMessage: (error) => error.message,
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  context.PayPalCheckoutBox({
    createdBooking: { booking_id: 'booking-1', booking_reference: 'reference-1' },
    onStart: () => events.push('start'), onCancel: () => events.push('cancel-notice'),
    onSuccess: () => events.push('success'), onError: () => events.push('error'),
  });
  await tick();
  return { options, events, cleanup: () => cleanups.forEach((fn) => fn()) };
}

test('closing before an order exists never cancels an earlier server order', async () => {
  const { options, events } = await mount();
  options.onCancel({});
  assert.deepEqual(events, ['cancel-notice']);
});

test('retry clears the notice and waits for the previous cancellation', async () => {
  let finishCancel;
  const { options, events } = await mount({ cancelPayPalOrder: () => new Promise((resolve) => { finishCancel = resolve; }) });
  await options.createOrder();
  options.onCancel({ orderID: 'order-1' });
  const retry = options.createOrder();
  await tick();
  assert.deepEqual(events, ['start', 'create', 'cancel-notice', 'start']);
  finishCancel();
  await retry;
  assert.equal(events.at(-1), 'create');
});

test('late cancellation cannot overwrite approval or successful capture', async () => {
  const { options, events } = await mount();
  await options.createOrder();
  await options.onApprove({ orderID: 'order-1' });
  options.onCancel({ orderID: 'order-1' });
  assert.deepEqual(events, ['start', 'create', 'success']);
});

test('unmount closes the SDK and ignores stale events', async () => {
  const { options, events, cleanup } = await mount();
  cleanup();
  options.onCancel({ orderID: 'order-1' });
  options.onError(new Error('stale'));
  await options.onApprove({ orderID: 'order-1' });
  assert.deepEqual(events, ['close']);
});
