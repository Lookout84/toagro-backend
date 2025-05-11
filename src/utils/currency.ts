
/**
 * Повертає символ валюти за її кодом
 */
export function getCurrencySymbol(currency: string): string {
  switch(currency) {
    case 'UAH': return '₴';
    case 'USD': return '$';
    case 'EUR': return '€';
    default: return '';
  }
}

/**
 * Форматує ціну з символом валюти
 */
export function formatPriceWithCurrency(price: number, currency: string): string {
  const formatter = new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  
  const formattedPrice = formatter.format(price);
  const symbol = getCurrencySymbol(currency);
  
  switch(currency) {
    case 'USD':
    case 'EUR':
      return `${symbol}${formattedPrice}`;
    case 'UAH':
    default:
      return `${formattedPrice} ${symbol}`;
  }
}