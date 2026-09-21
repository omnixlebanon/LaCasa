import { createContext, useState, useContext } from 'react';

const CurrencyContext = createContext();

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState(89500); 

  const toggleCurrency = () => {
    setCurrency((prev) => (prev === "USD" ? "LBP" : "USD"));
  };

  const changeRate = (newRate) => {
    const numericRate = parseFloat(newRate);
    if (Number.isFinite(numericRate) && numericRate > 0) {
      setRate(numericRate);
    }
  };
  // API values and editable form state stay in USD; convert at the UI boundary.
  const toDisplayAmount = (value) => Number(value) * (currency === 'LBP' ? rate : 1);
  const toBaseAmount = (value) => Number(value) / (currency === 'LBP' ? rate : 1);
  const currencyLabel = currency === 'LBP' ? 'L.L.' : '$';
  const formatCompactPrice = (value) => {
    const amount = toDisplayAmount(value);
    const formatted = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number.isFinite(amount) ? amount : 0);
    return currency === 'LBP' ? `${formatted} L.L.` : `$${formatted}`;
  };
  const formatPrice = (priceInUSD) => {
    const numericPrice = Number(priceInUSD);
    if (!Number.isFinite(numericPrice)) {
      return currency === "LBP" ? "0 L.L." : "$0.00";
    }

    if (currency === "LBP") {
      const convertedPrice = numericPrice * rate; 
      return `${Math.round(convertedPrice).toLocaleString()} L.L.`;
    }
    return `$${numericPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, currencyLabel, toggleCurrency, rate, changeRate, formatPrice, formatCompactPrice, toDisplayAmount, toBaseAmount }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
