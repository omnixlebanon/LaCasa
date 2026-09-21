import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'rolldown/utils';

// Run the actual context and input with a small hook host, without a browser or database.
function hookHost() {
  const state = [];
  let index = 0;
  return {
    reset() { index = 0; },
    useState(initial) {
      const slot = index++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], next => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }];
    },
  };
}
async function load(relative, name, bindings) {
  const source = (await readFile(new URL(relative, import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export default /g, '').replace(/export /g, '');
  const { code } = await transform('test.jsx', source, { jsx: { runtime: 'classic' } });
  return vm.runInNewContext(`${code}\n${name}`, {
    ...bindings,
    React: { createElement: (type, props, ...children) => ({ type, props, children }), Fragment: 'fragment' },
    createContext: () => ({ Provider: 'provider' }),
  });
}
const providerHost = hookHost();
const Provider = await load('../src/global.jsx', 'CurrencyProvider', providerHost);
const renderContext = () => { providerHost.reset(); return Provider({}).props.value; };
let context = renderContext();
assert.equal(context.formatPrice(2), '$2.00');
assert.equal(context.toBaseAmount(2), 2);
context.toggleCurrency(); context = renderContext();
assert.match(context.formatPrice(2), /179,000 L\.L\./);
assert.equal(context.toDisplayAmount(2), 179000);
assert.equal(context.toBaseAmount(179000), 2);
assert.match(context.formatCompactPrice(2000), /179M L\.L\./);
assert.match(context.formatPrice(-2), /-179,000/);
assert.equal(context.formatPrice('invalid'), '0 L.L.');

const inputHost = hookHost();
const Input = await load('../src/components/MoneyInput.jsx', 'MoneyInput', {
  ...inputHost, useCurrency: () => context,
});
let saved;
const renderInput = () => { inputHost.reset(); return Input({ name: 'price', defaultValue: 2, onChange: e => { saved = e.target.value; } }); };
let input = renderInput();
assert.equal(input.children[0].props.value, 179000);
input.children[0].props.onChange({ target: { value: '268500' } });
input = renderInput();
assert.equal(saved, 3);
assert.equal(input.children[1].props.name, 'price');
assert.equal(input.children[1].props.value, 3);
context.toggleCurrency(); context = renderContext();
input = renderInput();
assert.equal(input.children[0].props.value, 3);
assert.equal(input.children[1].props.value, 3);
context.toggleCurrency(); context.changeRate(100000); context = renderContext();
input = renderInput();
assert.equal(input.children[0].props.value, 300000);
assert.equal(input.children[1].props.value, 3);
context.changeRate(Infinity); context = renderContext();
assert.equal(context.rate, 100000);
input.children[0].props.onChange({ target: { value: '' } });
assert.equal(renderInput().children[0].props.value, '');
console.log('Currency switching, rate updates, formatting, and USD form submission checks passed.');
