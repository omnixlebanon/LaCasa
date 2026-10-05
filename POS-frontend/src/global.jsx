import { createContext, useState, useContext, useEffect, useRef } from 'react';
import axios from 'axios';
import api from './api.js';

const CurrencyContext = createContext();

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState("USD");
  const cacheKey = 'pos-shared-exchange-rate';
  const [rate, setRate] = useState(() => {
    try { const saved = Number(localStorage.getItem(cacheKey)); return saved > 0 && Number.isFinite(saved) ? saved : 89500; }
    catch { return 89500; }
  });
  const rateVersion = useRef(0);
  const savingRate = useRef(false);
  const storeRate = value => {
    setRate(value);
    try { localStorage.setItem(cacheKey, String(value)); } catch { /* Rate remains usable in memory. */ }
  };
  // Bypass the offline mutation queue: a shared rate is saved only after server confirmation.
  const requestOptions = () => ({ adapter: axios.getAdapter(['xhr', 'fetch']) });
  useEffect(() => {
    let mounted = true, fetching = false;
    const refresh = async () => {
      if (fetching || savingRate.current || !navigator.onLine || !localStorage.getItem('auth_user')) return;
      fetching = true;
      const version = rateVersion.current;
      try {
        const response = await api.get('/api/settings/exchange-rate', requestOptions());
        const value = Number(response.data.rate);
        if (mounted && version === rateVersion.current && Number.isFinite(value) && value > 0) storeRate(value);
      } catch { /* Retain the last confirmed rate when disconnected. */ }
      finally { fetching = false; }
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline-snapshot', refresh);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); window.removeEventListener('offline-snapshot', refresh); };
  }, []);

  const toggleCurrency = () => {
    setCurrency((prev) => (prev === "USD" ? "LBP" : "USD"));
  };

  const changeRate = async (newRate) => {
    const numericRate = parseFloat(newRate);
    if (!Number.isFinite(numericRate) || numericRate <= 0) throw new Error('Enter an exchange rate greater than zero.');
    if (!navigator.onLine) throw new Error('Connect to the internet to save the rate for all laptops.');
    if (savingRate.current) throw new Error('A rate change is already being saved.');
    savingRate.current = true; rateVersion.current++;
    try {
      const response = await api.put('/api/settings/exchange-rate', { rate: numericRate }, requestOptions());
      storeRate(Number(response.data.rate));
    } finally { savingRate.current = false; rateVersion.current++; }
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
