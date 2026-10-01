export function formatNaira(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₦0';
  if (num >= 1_000_000_000) {
    return `₦${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    return `₦${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `₦${num.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  }
  return `₦${num.toFixed(2)}`;
}

export function formatKobo(kobo: number): string {
  if (kobo < 0.0001) {
    return `${kobo.toExponential(2)} Kobo`;
  }
  if (kobo < 1) {
    return `${kobo.toFixed(4)} Kobo`;
  }
  return `${kobo.toFixed(2)} Kobo`;
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
