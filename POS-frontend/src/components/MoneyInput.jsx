import { useState } from 'react';
import { useCurrency } from '../global.jsx';

// The named form field always submits USD, including when entering Lebanese pounds.
export default function MoneyInput({ value, defaultValue = '', onChange, name, ...props }) {
  const { currency, rate, toDisplayAmount, toBaseAmount } = useCurrency();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [draft, setDraft] = useState(null);
  const baseValue = value ?? internalValue;
  const displayValue = draft && draft.baseValue === baseValue && draft.currency === currency && draft.rate === rate
    ? draft.text
    : baseValue === '' ? '' : Number(toDisplayAmount(baseValue).toPrecision(12));

  return <>
    <input {...props} type="number" step="any" value={displayValue} onChange={event => {
      const text = event.target.value;
      const nextValue = text === '' ? '' : toBaseAmount(text);
      setInternalValue(nextValue);
      setDraft({ text, baseValue: nextValue, currency, rate });
      onChange?.({ target: { name, value: nextValue, type: 'number' } });
    }} />
    <input type="hidden" name={name} value={baseValue} />
  </>;
}
