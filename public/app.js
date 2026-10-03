// State
let allTokens = [];
let allTrades = [];
let localRecentTrades = [];
let lastDepositLockTimestamp = 0;
let lastDepositLockedAmount = 0;
let currentCulture = 'All';
let currentSearch = '';
let selectedToken = null;
let currentTradeTab = 'buy';
let userNairaBalance = 0;
let userCngnBalance = 0;
let userEthBalance = 0;
let userTokenBalance = 0;
let userWalletAddress = null;
let appConfig = null;

const CNGN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const KOBO_CURVE_ABI = [
  "function buy(address tokenAddr, uint256 cngnIn, uint256 minTokensOut) returns (uint256)",
  "function sell(address tokenAddr, uint256 tokensIn, uint256 minCngnOut) returns (uint256)",
  "function getAmountOutTokens(address tokenAddr, uint256 cngnIn) view returns (uint256)",
  "function getAmountOutCngn(address tokenAddr, uint256 tokensIn) view returns (uint256)",
  "function tokens(address) view returns (address tokenAddress, string name, string symbol, string imageUri, string description, address creator, uint256 realCngn, uint256 realTokens, uint256 virtualCngn, uint256 virtualTokens, bool graduated, uint256 createdAt, uint256 totalTrades)",
  "function createToken(string name, string symbol, string imageUri, string description) returns (address)",
  "function allTokensLength() view returns (uint256)",
  "function allTokens(uint256) view returns (address)",
  "event TokenCreated(address indexed tokenAddress, string name, string symbol, string imageUri, string description, address indexed creator, uint256 timestamp)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

const KOBO_AMM_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)",
  "function getAmountsIn(uint256 amountOut, address[] calldata path) view returns (uint256[] memory amounts)",
  "function factory() view returns (address)"
];

// Currency formatters
function formatNaira(num) {
  if (num >= 1e9) return '₦' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '₦' + (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return '₦' + num.toLocaleString('en-NG', { maximumFractionDigits: 0 });
  return '₦' + Number(num).toFixed(2);
}

function formatKobo(kobo) {
  if (kobo < 0.0001) return kobo.toExponential(2) + ' Kobo';
  if (kobo < 1) return kobo.toFixed(4) + ' Kobo';
  return kobo.toFixed(2) + ' Kobo';
}

function shortenAddress(addr) {
  if (!addr) return '';
  return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
}

// Dynamic High-Quality Coin Avatar Fallback (Guarantees crisp avatars even if IPFS is slow or unpinned)
function generateCoinAvatar(symbol = 'COIN', name = '', cultureTag = 'Meme') {
  let emoji = '🪙';
  const symUpper = (symbol || '').toUpperCase();
  const nameLower = (name || '').toLowerCase();
  if (symUpper.includes('SHARC') || nameLower.includes('sharc')) emoji = '🦈';
  else if (symUpper.includes('DANFO') || nameLower.includes('danfo')) emoji = '🚌';
  else if (cultureTag === 'Community') emoji = '🤝';
  else if (cultureTag === 'Gaming') emoji = '🎮';
  else if (cultureTag === 'DeFi') emoji = '⚡';
  else if (cultureTag === 'Meme') emoji = '🔥';

  const cleanSym = (symbol || 'COIN').replace('$', '').slice(0, 5).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <defs>
      <linearGradient id="g_${cleanSym}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0F172A"/>
        <stop offset="100%" stop-color="#020617"/>
      </linearGradient>
    </defs>
    <rect width="256" height="256" rx="52" fill="url(#g_${cleanSym})"/>
    <rect width="252" height="252" x="2" y="2" rx="50" fill="none" stroke="#00FF87" stroke-width="2" stroke-opacity="0.35"/>
    <circle cx="128" cy="115" r="54" fill="#00FF87" fill-opacity="0.12"/>
    <text x="128" y="134" font-size="52" text-anchor="middle">${emoji}</text>
    <text x="128" y="210" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="28" fill="#FFE600" text-anchor="middle" letter-spacing="2">$${cleanSym}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// IPFS URL Resolver (Resolves ipfs://Qm... to /ipfs/Qm...)
function resolveIpfsUrl(uri) {
  if (!uri) return 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=400&auto=format&fit=crop&q=80';
  if (typeof uri !== 'string') return uri;
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '').trim();
    return `/ipfs/${cid}`;
  }
  return uri;
}


// Fetch initial data & config
async function initApp() {
  try {
    const configRes = await fetch('/api/config');
    appConfig = await configRes.json();
    console.log('Kobo Launchpad initialized with config:', appConfig);

    const tokensRes = await fetch('/api/tokens');
    const data = await tokensRes.json();
    allTokens = data.tokens || [];
    allTrades = data.trades || [];

    renderOdogwu();
    renderTokens();
    renderTrades();
    updateBalancesInUI();
  } catch (err) {
    console.error('App init error:', err);
  }
}

// Render Featured Spotlight Banner (Memoized to prevent reload flicker)
let lastRenderedOdogwuSig = '';
function renderOdogwu() {
  const container = document.getElementById('odogwuSection');
  if (!container || allTokens.length === 0) return;

  const topToken = [...allTokens].sort((a, b) => b.marketCapNaira - a.marketCapNaira)[0];
  if (!topToken) return;

  const sig = `${topToken.address}_${topToken.marketCapNaira}_${topToken.priceKobo}_${topToken.progressPercent}_${topToken.imageUri}`;
  if (sig === lastRenderedOdogwuSig) return;
  lastRenderedOdogwuSig = sig;

  container.innerHTML = `
    <div class="card-glass featured-glow" style="position: relative; overflow: hidden; padding: 28px; background: linear-gradient(135deg, rgba(16, 21, 32, 0.95), rgba(22, 28, 43, 0.9));">
      <div style="position: absolute; top: -40px; right: -40px; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle, rgba(0, 255, 135, 0.1) 0%, transparent 70%); pointer-events: none;"></div>

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; position: relative; z-index: 1;">
        <!-- Left: Image & Info -->
        <div style="display: flex; align-items: center; gap: 20px; flex: 1 1 450px;">
          <div style="position: relative;">
            <div style="position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #00FF87, #008751); border-radius: 9999px; padding: 4px 10px; display: flex; align-items: center; gap: 4px; box-shadow: 0 4px 10px rgba(0, 255, 135, 0.4); z-index: 2;">
              <span style="font-size: 11px;">⭐</span>
              <span style="font-size: 9px; font-weight: 900; color: #06080C; letter-spacing: 0.5px;">FEATURED</span>
            </div>
            <img src="${resolveIpfsUrl(topToken.imageUri)}" 
                 alt="${topToken.name}" 
                 onerror="this.onerror=null; this.src=generateCoinAvatar('${topToken.symbol}', '${topToken.name}', '${topToken.cultureTag}');"
                 style="width: 90px; height: 90px; border-radius: 20px; object-fit: cover; border: 2px solid rgba(0, 255, 135, 0.5); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6); background: #0A0F1D;">
          </div>

          <div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span class="verified-badge">◈ Verified Curve</span>
              <span style="background: rgba(0, 255, 135, 0.12); color: var(--kobo-green); font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(0, 255, 135, 0.3);">🔥 TOP MARKET CAP</span>
              <span style="background: rgba(99, 102, 241, 0.15); color: #A5B4FC; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px;">${topToken.cultureTag || 'Meme'}</span>
            </div>

            <h2 style="font-size: 28px; font-weight: 800; margin-top: 8px; letter-spacing: -0.5px; display: flex; align-items: center; gap: 10px; color: #FFF;">
              ${topToken.name}
              <span style="color: var(--cowrie-gold-light); font-size: 20px; font-weight: 600;">$${topToken.symbol}</span>
            </h2>

            <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px; max-width: 520px; line-height: 1.5;">
              ${topToken.description}
            </p>
          </div>
        </div>

        <!-- Right: Numbers & Meter -->
        <div style="display: flex; flex-direction: column; gap: 14px; min-width: 280px; flex: 0 1 360px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end;">
            <div>
              <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Market Cap</span>
              <div style="font-size: 24px; font-weight: 800; color: #FFF;">${formatNaira(topToken.marketCapNaira)}</div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Price</span>
              <div style="font-size: 16px; font-weight: 700; color: var(--kobo-green);">${formatKobo(topToken.priceKobo)}</div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; margin-bottom: 6px;">
              <span style="color: var(--cowrie-gold-light);">Bonding Curve (${topToken.progressPercent.toFixed(1)}%)</span>
              <span style="color: var(--text-muted);">${topToken.progressPercent >= 80 ? '🚀 High Liquidity! Migration Approaching' : 'Target: ₦10M cNGN'}</span>
            </div>
            <div style="height: 10px; background: rgba(0, 0, 0, 0.5); border-radius: 9999px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);">
              <div style="height: 100%; width: ${Math.min(100, topToken.progressPercent)}%; background: linear-gradient(90deg, #F59E0B, #00FF87); border-radius: 9999px;"></div>
            </div>
          </div>

          <button onclick="openTradeModal('${topToken.address}')" class="btn-kobo" style="width: 100%; padding: 12px; font-size: 15px;">
            <span>View Chart & Trade $${topToken.symbol}</span> ↗
          </button>
        </div>
      </div>
    </div>
  `;
}

// Render Tokens Grid with Category and Search Filter (Memoized to eliminate re-mount image flickering)
let lastRenderedTokensSig = '';
function renderTokens() {
  const container = document.getElementById('tokensGrid');
  if (!container) return;

  let filtered = [...allTokens];
  if (currentCulture === 'Trending') {
    filtered.sort((a, b) => (b.totalTrades || 0) - (a.totalTrades || 0));
  } else if (currentCulture === 'New') {
    filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else if (currentCulture === 'Graduating') {
    filtered.sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0));
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.symbol.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    lastRenderedTokensSig = 'empty_' + currentCulture + '_' + currentSearch;
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: 20px; border: 1px dashed var(--border-subtle);">
        <p style="font-size: 18px; font-weight: 700; color: var(--text-secondary);">No tokens found</p>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">Be the first person to launch a token on this curve!</p>
        <button onclick="document.getElementById('createCoinModal').classList.add('active')" class="btn-kobo" style="margin-top: 16px;">Launch Token</button>
      </div>
    `;
    return;
  }

  // Signature check: if tokens data is identical, do not wipe DOM. Prevents image flickering completely!
  const currentSig = filtered.map(t => `${t.address}_${t.priceKobo}_${t.marketCapNaira}_${t.totalTrades}_${t.progressPercent}_${t.imageUri}`).join('|') + `_${currentCulture}_${currentSearch}`;
  if (currentSig === lastRenderedTokensSig) {
    return;
  }
  lastRenderedTokensSig = currentSig;

  container.innerHTML = filtered.map(t => {
    let tagBg = 'rgba(0, 255, 135, 0.12)';
    let tagText = 'var(--kobo-green)';
    if (t.cultureTag === 'Meme') { tagBg = 'rgba(245, 158, 11, 0.15)'; tagText = '#FCD34D'; }
    else if (t.cultureTag === 'Community') { tagBg = 'rgba(99, 102, 241, 0.15)'; tagText = '#A5B4FC'; }
    else if (t.cultureTag === 'DeFi') { tagBg = 'rgba(59, 130, 246, 0.15)'; tagText = '#93C5FD'; }
    else if (t.cultureTag === 'Gaming') { tagBg = 'rgba(168, 85, 247, 0.15)'; tagText = '#C084FC'; }

    return `
      <div class="card-glass" onclick="openTradeModal('${t.address}')" style="display: flex; flex-direction: column; justify-content: space-between; padding: 20px; position: relative; overflow: hidden; cursor: pointer;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <span style="font-size: 10px; font-weight: 700; background: ${tagBg}; color: ${tagText}; padding: 3px 8px; border-radius: 9999px;">
              ${t.cultureTag || 'Meme'}
            </span>
            <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">
              ${t.totalTrades} Trades
            </span>
          </div>

          <div style="display: flex; gap: 14px; align-items: center;">
            <img src="${resolveIpfsUrl(t.imageUri)}" 
                 alt="${t.name}" 
                 onerror="this.onerror=null; this.src=generateCoinAvatar('${t.symbol}', '${t.name}', '${t.cultureTag}');" 
                 loading="lazy" 
                 style="width: 58px; height: 58px; border-radius: 16px; object-fit: cover; border: 1px solid var(--border-subtle); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4); background: #0A0F1D;">
            <div style="flex: 1; min-width: 0;">
              <h3 style="font-size: 17px; font-weight: 700; color: #FFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.name}</h3>
              <span style="font-size: 13px; font-weight: 600; color: var(--cowrie-gold-light);">$${t.symbol}</span>
            </div>
          </div>

          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 12px; line-height: 1.4; height: 34px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
            ${t.description}
          </p>
        </div>

        <div style="margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 10px 12px; background: rgba(0, 0, 0, 0.35); border-radius: 12px; margin-bottom: 12px;">
            <div>
              <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Market Cap</span>
              <div style="font-size: 15px; font-weight: 700; color: #FFF;">${formatNaira(t.marketCapNaira)}</div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Price</span>
              <div style="font-size: 13px; font-weight: 600; color: var(--kobo-green);">${formatKobo(t.priceKobo)}</div>
            </div>
          </div>

          <div style="margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">
              <span>Bonding Curve</span>
              <span style="color: var(--cowrie-gold-light); font-weight: 600;">${t.progressPercent.toFixed(1)}%</span>
            </div>
            <div style="height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 9999px; overflow: hidden;">
              <div style="height: 100%; width: ${Math.min(100, t.progressPercent)}%; background: var(--kobo-green); border-radius: 9999px;"></div>
            </div>
          </div>

          <button onclick="event.stopPropagation(); openTradeModal('${t.address}')" class="btn-secondary" style="width: 100%; justify-content: center; padding: 9px; font-size: 13px; border-color: rgba(0, 255, 135, 0.25);">
            <span>View Chart & Trade</span> ↗
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Sidebar Navigation Controller
window.sidebarNav = function(page, btn) {
  document.querySelectorAll('.sidebar-nav-btn').forEach(b => {
    b.classList.remove('active');
    b.style.background = 'transparent';
    b.style.border = '1px solid transparent';
    b.style.color = 'var(--text-secondary)';
    b.style.fontWeight = '600';
  });

  if (btn) {
    btn.classList.add('active');
    btn.style.background = 'rgba(0,255,135,0.12)';
    btn.style.border = '1px solid rgba(0,255,135,0.25)';
    btn.style.color = '#FFF';
    btn.style.fontWeight = '700';
  }

  currentCulture = page === 'explore' ? 'All' : page === 'trending' ? 'Trending' : page === 'new' ? 'New' : 'Graduating';

  // Sync horizontal culture tabs
  document.querySelectorAll('.culture-tab').forEach(t => {
    const isTarget = t.getAttribute('data-culture') === currentCulture;
    t.classList.toggle('active', isTarget);
    t.style.background = isTarget ? 'var(--bg-elevated)' : 'transparent';
    t.style.color = isTarget ? '#FFF' : 'var(--text-secondary)';
    t.style.border = isTarget ? '1px solid rgba(255,255,255,0.15)' : 'none';
  });

  renderTokens();
};

// Search Input Listener
const searchInputEl = document.getElementById('searchInput');
if (searchInputEl) {
  searchInputEl.addEventListener('input', (e) => {
    currentSearch = e.target.value.trim();
    renderTokens();
  });
}

// Culture Tabs Listeners
document.querySelectorAll('.culture-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.culture-tab').forEach(t => {
      t.classList.remove('active');
      t.style.background = 'transparent';
      t.style.color = 'var(--text-secondary)';
      t.style.border = 'none';
    });
    tab.classList.add('active');
    tab.style.background = 'var(--bg-elevated)';
    tab.style.color = '#FFF';
    tab.style.border = '1px solid rgba(255,255,255,0.15)';

    currentCulture = tab.getAttribute('data-culture') || 'All';

    // Sync sidebar button
    const map = { 'All': 'explore', 'Trending': 'trending', 'New': 'new', 'Graduating': 'graduating' };
    const page = map[currentCulture] || 'explore';
    document.querySelectorAll('.sidebar-nav-btn').forEach(b => {
      const match = b.getAttribute('data-page') === page;
      b.classList.toggle('active', match);
      b.style.background = match ? 'rgba(0,255,135,0.12)' : 'transparent';
      b.style.border = match ? '1px solid rgba(0,255,135,0.25)' : '1px solid transparent';
      b.style.color = match ? '#FFF' : 'var(--text-secondary)';
      b.style.fontWeight = match ? '700' : '600';
    });

    renderTokens();
  });
});

// Render Trade Ticker (Continuous moving marquee with memoized update to avoid 3s jump)
let lastRenderedTradesSig = '';

function renderTrades() {
  const container = document.getElementById('tradeTicker');
  const barSection = document.getElementById('liveTradesSection');
  if (!container) return;

  // Only show genuine verified trades with valid symbols (never generic '$TOKEN' or empty amounts)
  const validTrades = (allTrades || []).filter(t => t && t.tokenSymbol && t.tokenSymbol !== 'TOKEN' && t.cngnAmount > 0);

  if (validTrades.length === 0) {
    if (barSection) barSection.style.display = 'none';
    container.innerHTML = '';
    lastRenderedTradesSig = 'empty';
    return;
  }

  // Show bar when genuine verified trades exist
  if (barSection) barSection.style.display = 'block';

  // Create signature of trade data so background 3s polling doesn't reset the marquee translation
  const currentSig = validTrades.slice(0, 20).map(t => (t.id || t.txHash || '') + '_' + t.tokenSymbol + '_' + t.cngnAmount).join('|');
  if (currentSig === lastRenderedTradesSig) return;
  lastRenderedTradesSig = currentSig;

  const tradesToDisplay = validTrades.slice(0, 20);
  const renderItem = (tr) => {
    const isBuy = tr.isBuy;
    const badgeColor = isBuy ? 'var(--kobo-green)' : '#F87171';
    const actionText = isBuy ? 'bought' : 'sold';
    const cngnFmt = tr.cngnAmount >= 1e6
      ? '₦' + (tr.cngnAmount / 1e6).toFixed(2) + 'M'
      : tr.cngnAmount >= 1e3
        ? '₦' + tr.cngnAmount.toLocaleString('en-NG', { maximumFractionDigits: 0 })
        : '₦' + Number(tr.cngnAmount).toFixed(2);

    const tokenClickAttr = tr.tokenAddress ? `onclick="openTradeModal('${tr.tokenAddress}')"` : '';
    const clickTitle = tr.tokenAddress ? `Click to trade $${tr.tokenSymbol}` : '';

    return `
      <div class="ticker-item" ${tokenClickAttr} title="${clickTitle}">
        <span style="color: #94A3B8; font-family: monospace; font-size: 11px;">${tr.trader}</span>
        <span style="color: ${badgeColor}; font-weight: 700;">${actionText} ${cngnFmt}</span>
        <span style="color: var(--cowrie-gold-light); font-weight: 700;">$${tr.tokenSymbol}</span>
        <span style="color: #64748B; font-size: 10px;">(${tr.timeAgo})</span>
        <span style="color: rgba(255, 255, 255, 0.15); margin-left: 12px;">•</span>
      </div>
    `;
  };

  const baseHtml = tradesToDisplay.map(renderItem).join('');
  let sequence = baseHtml;
  if (tradesToDisplay.length >= 2 && tradesToDisplay.length < 5) {
    sequence = baseHtml + baseHtml;
  }
  container.innerHTML = sequence;
}

// Friendly error message parser for on-chain reverts
function parseTradeError(err) {
  const raw = String(err?.reason || err?.message || err?.data?.message || err || '');
  if (!raw) return 'Transaction failed. Please try again.';
  if (raw.includes('user rejected') || raw.includes('ACTION_REJECTED') || raw.includes('User denied') || raw.includes('rejected')) {
    return 'You cancelled the transaction in your wallet.';
  }
  if (raw.includes('insufficient funds') || raw.includes('insufficient balance')) {
    return 'Not enough Base Sepolia ETH for gas. Claim free ETH from the Gas Station.';
  }
  if (raw.includes('Coin don already graduate') || raw.includes('graduated') || raw.includes('Trade on Aerodrome')) {
    return 'This token has graduated to DEX! Use the DEX Route to execute your trade.';
  }
  if (raw.includes('Slippage too high') || raw.includes('slippage')) {
    return 'Slippage too high — the price moved during execution. Try a smaller amount.';
  }
  if (raw.includes('Coin no dey exist') || raw.includes('token not registered')) {
    return 'This token is not registered on the bonding curve contract.';
  }
  if (raw.includes('cNGN transfer failed') || raw.includes('ERC20: insufficient allowance')) {
    return 'cNGN approval failed. Please approve the transaction in your wallet.';
  }
  if (raw.includes('CALL_EXCEPTION') || raw.includes('execution reverted')) {
    return 'Smart contract rejected the trade. If the curve is 100% filled, the token has graduated.';
  }
  // Sanitize and avoid JSON or long dumps
  const clean = raw.replace(/\{.*?\}/gs, '').replace(/\[.*?\]/gs, '').trim();
  if (clean.length > 90) return clean.substring(0, 90) + '...';
  return clean || 'Transaction failed. Please try again.';
}

// Status Box Helper — with prominent built-in dismiss / cancel button
function showTradeStatus(html, type = 'info') {
  const box = document.getElementById('tradeStatusBox');
  if (!box) return;
  box.style.display = 'block';

  const dismissBtn = `<button type="button" onclick="this.parentElement.style.display='none'" style="position:absolute;top:8px;right:10px;background:rgba(255,255,255,0.12);border:none;color:#FFF;width:24px;height:24px;border-radius:50%;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:background 0.15s;z-index:10;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'" title="Dismiss error">✕</button>`;
  box.style.position = 'relative';
  box.innerHTML = dismissBtn + html;

  if (type === 'success') {
    box.style.background = 'rgba(0, 255, 135, 0.12)';
    box.style.border = '1px solid rgba(0, 255, 135, 0.35)';
    box.style.color = '#00FF87';
  } else if (type === 'error') {
    box.style.background = 'rgba(239, 68, 68, 0.15)';
    box.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    box.style.color = '#F87171';
  } else {
    box.style.background = 'rgba(99, 102, 241, 0.15)';
    box.style.border = '1px solid rgba(99, 102, 241, 0.35)';
    box.style.color = '#C7D2FE';
  }
}

// User Signer Resolver - Dynamic handles all wallet types (MetaMask, Coinbase, Email, Social)
async function getUserSigner() {
  // Dynamic SDK - handles MetaMask, Coinbase Wallet, Email OTP, Google, and all social logins
  if (window.getDynamicSigner) {
    try {
      const dynSigner = await window.getDynamicSigner();
      if (dynSigner) {
        const addr = await dynSigner.getAddress();
        console.log('⚡ [Signer] Dynamic SDK signer acquired:', addr);
        // Sync the address into app state
        if (addr && addr.toLowerCase() !== (userWalletAddress || '').toLowerCase()) {
          userWalletAddress = addr;
          updateBalancesInUI();
        }
        return dynSigner;
      }
    } catch (e) {
      console.warn('Dynamic signer notice:', e);
    }
  }

  return null;
}

// Gas Check (Alerts user if balance is low, no automated relayer)
async function checkGasSufficient(userAddress) {
  try {
    const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
    const bal = await provider.getBalance(userAddress);
    const balEth = Number(ethers.formatEther(bal));
    userEthBalance = balEth;
    updateBalancesInUI();

    if (balEth < 0.00008) {
      showTradeStatus(`
        <div style="font-weight: 800; font-size: 13px; margin-bottom: 4px; color: #FCA5A5;">⚠️ Insufficient Base Sepolia ETH for Gas!</div>
        <div style="margin-bottom: 8px; color: #E2E8F0; line-height: 1.4;">
          Your balance is <b>${balEth.toFixed(5)} ETH</b>. You need a tiny amount of testnet ETH (~0.0001 ETH / ₦0.05) to sign this transaction on Base Sepolia.
        </div>
        <button type="button" onclick="openAccountHub('tab-gas')" class="btn-kobo" style="background: linear-gradient(135deg, #3B82F6, #1D4ED8); padding: 8px 16px; font-size: 12px; font-weight: 700;">
          ⛽ Open Gas Station (Account Hub)
        </button>
      `, 'error');
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Gas check warning:', err);
    return true;
  }
}

// Gas Faucet Modal Opener
window.openGasModal = function() {
  if (window.openAccountHub) {
    window.openAccountHub('tab-gas');
  }
};

let tokenPriceChart = null;

function renderTokenChart(priceHistory, symbol) {
  const canvas = document.getElementById('tokenDetailChart');
  if (!canvas) return;

  const labels = priceHistory.map(p => p.time);
  const dataPoints = priceHistory.map(p => p.price);

  // If chart already exists for this symbol, update datasets smoothly without canvas thrashing
  if (tokenPriceChart && tokenPriceChart.data && tokenPriceChart.data.datasets && tokenPriceChart.data.datasets[0]) {
    if (tokenPriceChart.data.datasets[0].label === `$${symbol} Price (Kobo)`) {
      tokenPriceChart.data.labels = labels;
      tokenPriceChart.data.datasets[0].data = dataPoints;
      tokenPriceChart.update('none');
      return;
    }
  }

  if (tokenPriceChart) {
    tokenPriceChart.destroy();
    tokenPriceChart = null;
  }

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(0, 255, 135, 0.28)');
  gradient.addColorStop(1, 'rgba(0, 255, 135, 0.01)');

  tokenPriceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `$${symbol} Price (Kobo)`,
        data: dataPoints,
        borderColor: '#00FF87',
        borderWidth: 2.5,
        backgroundColor: gradient,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#00FF87',
        pointBorderColor: '#0E131D',
        pointBorderWidth: 1.5,
        pointRadius: dataPoints.length > 20 ? 0 : 3.5,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0A0F1D',
          titleColor: '#94A3B8',
          bodyColor: '#00FF87',
          borderColor: 'rgba(0, 255, 135, 0.35)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (item) => `${item.parsed.y} Kobo per token`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748B', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: {
            color: '#64748B',
            font: { size: 10 },
            callback: (val) => val.toFixed(4) + 'k'
          }
        }
      }
    }
  });
}

// Global modal refresh function for immediate (0ms) and recurring 3s live updates across all coins
let isRefreshingTradeModal = false;

window.refreshTradeModalData = async function(optimisticTrade = null) {
  if (!selectedToken) return;

  // 1. INSTANT OPTIMISTIC FEEDBACK (0ms)
  // When a user makes a trade, display it immediately at top of trade list
  if (optimisticTrade) {
    try {
      optimisticTrade.createdAt = optimisticTrade.createdAt || Date.now();
      optimisticTrade.tokenAddress = optimisticTrade.tokenAddress || (selectedToken ? selectedToken.address : '');
      localRecentTrades.unshift({ ...optimisticTrade });
      if (localRecentTrades.length > 50) localRecentTrades.pop();

      const tradesTbody = document.getElementById('tradeTokenTradesList');
      const tradeCountBadge = document.getElementById('tradeTokenTradeCountBadge');
      const totalTradesEl = document.getElementById('tradeTokenTotalTrades');

      if (totalTradesEl) {
        const curCount = parseInt(totalTradesEl.innerText) || 0;
        totalTradesEl.innerText = curCount + 1;
      }

      if (tradesTbody) {
        if (tradesTbody.innerText.includes('No trades recorded yet')) {
          tradesTbody.innerHTML = '';
        }
        const optTokFmt = (optimisticTrade.tokenAmount >= 1e6)
          ? (optimisticTrade.tokenAmount / 1e6).toFixed(2) + 'M'
          : (optimisticTrade.tokenAmount >= 1e3)
            ? (optimisticTrade.tokenAmount / 1e3).toFixed(1) + 'K'
            : Math.round(optimisticTrade.tokenAmount).toLocaleString('en-NG');

        const optCngnFmt = '₦' + ((optimisticTrade.cngnAmount >= 1e6)
          ? (optimisticTrade.cngnAmount / 1e6).toFixed(2) + 'M'
          : (optimisticTrade.cngnAmount >= 1e3)
            ? optimisticTrade.cngnAmount.toLocaleString('en-NG', { maximumFractionDigits: 0 })
            : optimisticTrade.cngnAmount.toFixed(2));

        const optTrader = shortenAddress(optimisticTrade.traderAddress || userWalletAddress || '0x...');
        const optRow = `
          <tr class="terminal-trade-row" style="background: rgba(0, 255, 135, 0.14); border-left: 3px solid var(--kobo-green); animation: fadeIn 0.3s ease-out;">
            <td style="padding: 6px 8px;">
              <span class="${optimisticTrade.isBuy ? 'terminal-badge-buy' : 'terminal-badge-sell'}">${optimisticTrade.isBuy ? '▲ BUY' : '▼ SELL'}</span>
            </td>
            <td style="padding: 6px 8px; font-weight: 700; color: #FFF;">
              ${optCngnFmt}
              <span style="font-size:9px;color:var(--kobo-green);margin-left:4px;font-weight:700;">JUST NOW</span>
            </td>
            <td style="padding: 6px 8px; color: var(--text-secondary);">${optTokFmt}</td>
            <td style="padding: 6px 8px; font-family: monospace; color: #CBD5E1;">${optTrader}</td>
            <td style="padding: 6px 8px; color: var(--kobo-green); font-size: 10px; font-weight: 700;">Just now</td>
            <td style="padding: 6px 8px; text-align: right;">
              ${optimisticTrade.txHash && optimisticTrade.txHash.startsWith('0x')
                ? `<a href="https://sepolia.basescan.org/tx/${optimisticTrade.txHash}" target="_blank" style="color: #93C5FD; text-decoration: none;">↗</a>`
                : `<span style="color: var(--text-muted);">-</span>`}
            </td>
          </tr>`;
        tradesTbody.insertAdjacentHTML('afterbegin', optRow);
        if (tradeCountBadge) {
          const rowCount = tradesTbody.querySelectorAll('tr').length;
          tradeCountBadge.innerText = `${rowCount} trades recorded`;
        }
      }
    } catch (optErr) {
      console.warn('Optimistic trade render error:', optErr);
    }
  }

  // Prevent multiple concurrent network queries during rapid polling
  if (isRefreshingTradeModal && !optimisticTrade) return;
  isRefreshingTradeModal = true;

  try {
    const detailRes = await fetch(`/api/tokens/details?address=${selectedToken.address}&t=${Date.now()}`);
    const detailData = await detailRes.json();

    if (detailData.success) {
      if (detailData.token) {
        selectedToken = { ...selectedToken, ...detailData.token };

        // Keep allTokens array in sync so homepage card updates in real time too
        const idx = allTokens.findIndex(t => t.address.toLowerCase() === selectedToken.address.toLowerCase());
        if (idx !== -1) {
          allTokens[idx] = { ...allTokens[idx], ...detailData.token };
        }

        const priceLarge = document.getElementById('tradeTokenPriceLarge');
        if (priceLarge) priceLarge.innerText = formatKobo(selectedToken.priceKobo);
        const priceNaira = document.getElementById('tradeTokenPriceNaira');
        if (priceNaira) priceNaira.innerText = '₦' + ((selectedToken.priceKobo || 0.0025) / 100).toFixed(6) + ' cNGN';

        const mcapEl = document.getElementById('tradeTokenMarketCap');
        if (mcapEl) mcapEl.innerText = formatNaira(selectedToken.marketCapNaira);

        const curveCngnEl = document.getElementById('tradeTokenCurveCngn');
        if (curveCngnEl) curveCngnEl.innerText = '₦' + Math.floor(selectedToken.realCngn || 0).toLocaleString() + ' cNGN';

        const totalTradesEl = document.getElementById('tradeTokenTotalTrades');
        if (totalTradesEl) totalTradesEl.innerText = selectedToken.totalTrades || 0;

        const progressPercentEl = document.getElementById('tradeCurveProgressPercent');
        const progressFillEl = document.getElementById('tradeCurveProgressFill');
        const pct = (selectedToken.progressPercent || 0).toFixed(1);
        if (progressPercentEl) progressPercentEl.innerText = pct + '%';
        if (progressFillEl) progressFillEl.style.width = Math.min(100, Math.max(0.5, selectedToken.progressPercent || 0)) + '%';

        // Check graduation & AMM DEX links
        const gradBox = document.getElementById('tradeGraduatedBox');
        if (gradBox) gradBox.style.display = selectedToken.graduated ? 'block' : 'none';

        const dexLink = document.getElementById('btnTradeDexLink');
        if (dexLink && selectedToken.ammPair) {
          dexLink.href = `https://sepolia.basescan.org/address/${selectedToken.ammPair}`;
          dexLink.innerHTML = '<span>View AMM Pool on Basescan</span> ↗';
        }
      }

      // Render or live update Chart
      if (Array.isArray(detailData.priceHistory) && detailData.priceHistory.length > 0) {
        renderTokenChart(detailData.priceHistory, selectedToken.symbol);
      }

      // Render Trade History (merged with local recent trades so optimistic trades never disappear)
      const tradesTbody = document.getElementById('tradeTokenTradesList');
      const tradeCountBadge = document.getElementById('tradeTokenTradeCountBadge');
      if (tradesTbody && Array.isArray(detailData.trades)) {
        let mergedTrades = [...detailData.trades];
        const threeMinAgo = Date.now() - 180000;
        const relevantLocalTrades = localRecentTrades.filter(lt =>
          lt.tokenAddress &&
          selectedToken &&
          lt.tokenAddress.toLowerCase() === selectedToken.address.toLowerCase() &&
          lt.createdAt > threeMinAgo
        );

        for (const lt of relevantLocalTrades) {
          const exists = mergedTrades.some(mt => mt.txHash && lt.txHash && mt.txHash.toLowerCase() === lt.txHash.toLowerCase());
          if (!exists) {
            mergedTrades.unshift({
              id: lt.id || 'opt-' + lt.createdAt,
              tokenAddress: lt.tokenAddress,
              tokenSymbol: selectedToken.symbol,
              trader: shortenAddress(lt.traderAddress || userWalletAddress),
              traderAddress: lt.traderAddress || userWalletAddress,
              isBuy: lt.isBuy,
              cngnAmount: lt.cngnAmount,
              tokenAmount: lt.tokenAmount,
              txHash: lt.txHash,
              createdAt: lt.createdAt,
              timeAgo: 'Just now'
            });
          }
        }

        if (tradeCountBadge) tradeCountBadge.innerText = `${mergedTrades.length} trades recorded`;
        if (mergedTrades.length === 0) {
          tradesTbody.innerHTML = `<tr><td colspan="6" style="padding: 16px; text-align: center; color: var(--text-muted);">No trades recorded yet. Be the first to buy!</td></tr>`;
        } else {
          const totalVol = mergedTrades.reduce((sum, t) => sum + (t.cngnAmount || 0), 0);
          tradesTbody.innerHTML = mergedTrades.map(tr => {
            const pct = totalVol > 0 ? ((tr.cngnAmount / totalVol) * 100).toFixed(1) : '0.0';
            const tokFmt = tr.tokenAmount >= 1e6
              ? (tr.tokenAmount / 1e6).toFixed(2) + 'M'
              : tr.tokenAmount >= 1e3
                ? (tr.tokenAmount / 1e3).toFixed(1) + 'K'
                : Math.round(tr.tokenAmount).toLocaleString('en-NG');
            const cngnFmt = '₦' + (tr.cngnAmount >= 1e6
              ? (tr.cngnAmount / 1e6).toFixed(2) + 'M'
              : tr.cngnAmount >= 1e3
                ? tr.cngnAmount.toLocaleString('en-NG', { maximumFractionDigits: 0 })
                : tr.cngnAmount.toFixed(2));
            return `
            <tr class="terminal-trade-row">
              <td style="padding: 6px 8px;">
                <span class="${tr.isBuy ? 'terminal-badge-buy' : 'terminal-badge-sell'}">${tr.isBuy ? '▲ BUY' : '▼ SELL'}</span>
              </td>
              <td style="padding: 6px 8px; font-weight: 700; color: #FFF;">
                ${cngnFmt}
                <span style="font-size:9px;color:#64748B;margin-left:4px;">${pct}%</span>
              </td>
              <td style="padding: 6px 8px; color: var(--text-secondary);">${tokFmt}</td>
              <td style="padding: 6px 8px; font-family: monospace; color: #CBD5E1;">${tr.trader}</td>
              <td style="padding: 6px 8px; color: var(--text-muted); font-size: 10px;">${tr.timeAgo}</td>
              <td style="padding: 6px 8px; text-align: right;">
                ${tr.txHash && tr.txHash.startsWith('0x') && tr.txHash.length > 20
                  ? `<a href="https://sepolia.basescan.org/tx/${tr.txHash}" target="_blank" style="color: #93C5FD; text-decoration: none;">↗</a>`
                  : `<span style="color: var(--text-muted);">-</span>`}
              </td>
            </tr>`;
          }).join('');
        }
      }
    }

    // Refresh token and cNGN balances for user
    if (userWalletAddress && selectedToken) {
      try {
        const [tbRes, cngnRes] = await Promise.all([
          fetch(`/api/token-balance?address=${userWalletAddress}&tokenAddress=${selectedToken.address}&t=${Date.now()}`),
          fetch(`/api/cngn-balance?address=${userWalletAddress}&t=${Date.now()}`)
        ]);
        const tbData = await tbRes.json();
        if (tbData.success && typeof tbData.balance === 'number') {
          userTokenBalance = tbData.balance;
        }
        const cngnData = await cngnRes.json();
        if (cngnData.success && typeof cngnData.balance === 'number') {
          userCngnBalance = cngnData.balance;
        }
      } catch (balErr) {
        console.warn('Balance refresh error:', balErr);
      }
    }

    updateBalancesInUI();
    updateTradeCalculation();

  } catch (err) {
    console.warn('Error refreshing trade modal data:', err);
  } finally {
    isRefreshingTradeModal = false;
  }
};

// Open Token Terminal & Trade Modal
window.openTradeModal = async function(tokenAddress) {
  selectedToken = allTokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) || allTokens.find(t => t.address === tokenAddress);
  if (!selectedToken) return;

  // Reset chart instance if switching between different tokens
  if (tokenPriceChart) {
    tokenPriceChart.destroy();
    tokenPriceChart = null;
  }

  // Basic Header info
  const tradeImg = document.getElementById('tradeTokenImage');
  if (tradeImg) {
    tradeImg.src = resolveIpfsUrl(selectedToken.imageUri);
    tradeImg.onerror = () => {
      tradeImg.onerror = null;
      tradeImg.src = generateCoinAvatar(selectedToken.symbol, selectedToken.name, selectedToken.cultureTag);
    };
  }
  document.getElementById('tradeTokenName').innerText = selectedToken.name;
  document.getElementById('tradeTokenSymbol').innerText = '$' + selectedToken.symbol;
  
  const tagEl = document.getElementById('tradeTokenTag');
  if (tagEl) tagEl.innerText = selectedToken.cultureTag || 'Meme';

  // Contract address & copy
  const contractShort = document.getElementById('tradeTokenContractShort');
  if (contractShort) contractShort.innerText = shortenAddress(selectedToken.address);
  const basescanLink = document.getElementById('linkTokenBasescan');
  if (basescanLink) basescanLink.href = `https://sepolia.basescan.org/token/${selectedToken.address}`;

  // Creator address & copy
  const creatorShort = document.getElementById('tradeTokenCreatorShort');
  if (creatorShort) creatorShort.innerText = shortenAddress(selectedToken.creator || '0x000...0000');

  // IPFS URI & copy
  const ipfsShort = document.getElementById('tradeTokenIpfsShort');
  const ipfsUri = selectedToken.imageUri && selectedToken.imageUri.startsWith('ipfs://') 
    ? selectedToken.imageUri 
    : 'ipfs://QmaY3...';
  if (ipfsShort) {
    const rawCid = ipfsUri.replace('ipfs://', '');
    ipfsShort.innerText = shortenAddress(rawCid);
  }

  // Copy buttons
  const btnCopyContract = document.getElementById('btnCopyTokenContract');
  if (btnCopyContract) {
    btnCopyContract.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(selectedToken.address);
      btnCopyContract.innerText = '✓';
      setTimeout(() => { btnCopyContract.innerText = '📋'; }, 1800);
    };
  }

  const btnCopyCreator = document.getElementById('btnCopyTokenCreator');
  if (btnCopyCreator) {
    btnCopyCreator.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(selectedToken.creator || selectedToken.address);
      btnCopyCreator.innerText = '✓';
      setTimeout(() => { btnCopyCreator.innerText = '📋'; }, 1800);
    };
  }

  const btnCopyIpfs = document.getElementById('btnCopyTokenIpfs');
  if (btnCopyIpfs) {
    btnCopyIpfs.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(ipfsUri);
      btnCopyIpfs.innerText = '✓';
      setTimeout(() => { btnCopyIpfs.innerText = '📋'; }, 1800);
    };
  }

  // Stat Bar Initial Render
  const priceLarge = document.getElementById('tradeTokenPriceLarge');
  if (priceLarge) priceLarge.innerText = formatKobo(selectedToken.priceKobo);
  const priceNaira = document.getElementById('tradeTokenPriceNaira');
  if (priceNaira) priceNaira.innerText = '₦' + ((selectedToken.priceKobo || 0.0025) / 100).toFixed(6) + ' cNGN';

  const mcapEl = document.getElementById('tradeTokenMarketCap');
  if (mcapEl) mcapEl.innerText = formatNaira(selectedToken.marketCapNaira);

  const curveCngnEl = document.getElementById('tradeTokenCurveCngn');
  if (curveCngnEl) curveCngnEl.innerText = '₦' + Math.floor(selectedToken.realCngn || 0).toLocaleString() + ' cNGN';

  const totalTradesEl = document.getElementById('tradeTokenTotalTrades');
  if (totalTradesEl) totalTradesEl.innerText = selectedToken.totalTrades || 0;

  // Bonding Curve Progress Initial Render
  const progressPercentEl = document.getElementById('tradeCurveProgressPercent');
  const progressFillEl = document.getElementById('tradeCurveProgressFill');
  const pct = (selectedToken.progressPercent || 0).toFixed(1);
  if (progressPercentEl) progressPercentEl.innerText = pct + '%';
  if (progressFillEl) progressFillEl.style.width = Math.min(100, Math.max(0.5, selectedToken.progressPercent || 0)) + '%';

  // Description
  const descEl = document.getElementById('tradeTokenDescription');
  if (descEl) descEl.innerText = selectedToken.description || 'Fair launch community token with locked bonding curve on Base Sepolia.';

  // Signer & Gas
  const accountDisplay = document.getElementById('tradeAccountDisplay');
  if (accountDisplay) {
    accountDisplay.innerText = userWalletAddress ? shortenAddress(userWalletAddress) : 'No wallet connected';
    accountDisplay.style.color = userWalletAddress ? 'var(--kobo-green)' : '#F59E0B';
  }

  const gasBadge = document.getElementById('tradeGasBadge');
  if (gasBadge) {
    gasBadge.innerText = (userEthBalance ? userEthBalance.toFixed(4) : '0.0000') + ' ETH';
  }

  // Clear status box
  const statusBox = document.getElementById('tradeStatusBox');
  if (statusBox) statusBox.style.display = 'none';

  // Open modal immediately so user feels 0 latency
  document.getElementById('tradeModal').classList.add('active');

  // Load deep details, live trades & chart immediately
  await refreshTradeModalData();
};

function updateTradeCalculation() {
  if (!selectedToken) return;
  const amountInput = typeof getTradeAmount === 'function' ? getTradeAmount() : (parseFloat(document.getElementById('tradeAmountInput').value.replace(/[^0-9.]/g, '')) || 0);

  // Check graduation status
  const isGraduated = !!selectedToken.graduated;
  const gradBox = document.getElementById('tradeGraduatedBox');
  if (gradBox) {
    gradBox.style.display = isGraduated ? 'block' : 'none';
  }

  const submitBtn = document.getElementById('btnSubmitTrade');
  const card1Label = document.getElementById('tradeCard1Label');
  const card1BalLabel = document.getElementById('tradeCard1BalLabel');
  const card1Bal = document.getElementById('tradeCard1Balance');
  const card1BalUnit = document.getElementById('tradeCard1BalanceUnit');
  const card1Icon = document.getElementById('tradeCard1Icon');
  const card1Unit = document.getElementById('tradeCard1Unit');
  const card1SubVal = document.getElementById('tradeCard1SubVal');

  const card2Label = document.getElementById('tradeCard2Label');
  const card2BalLabel = document.getElementById('tradeCard2BalLabel');
  const card2Bal = document.getElementById('tradeCard2Balance');
  const card2BalUnit = document.getElementById('tradeCard2BalanceUnit');
  const card2Icon = document.getElementById('tradeCard2Icon');
  const card2Unit = document.getElementById('tradeCard2Unit');
  const card2SubVal = document.getElementById('tradeCard2SubVal');
  const receiveAmountEl = document.getElementById('tradeReceiveAmount');

  // Compatibility references
  const balanceDisplay = document.getElementById('tradeUserBalance');
  const balanceUnit = document.getElementById('tradeUserBalanceUnit');
  const inputLabel = document.getElementById('tradeInputLabel');
  const inputUnit = document.getElementById('tradeInputUnit');
  const receiveLabel = document.getElementById('estimatedReceiveLabel');

  const priceCngn = (selectedToken.priceKobo || 0.0025) / 100;

  if (currentTradeTab === 'buy') {
    // --- BUY MODE ---
    if (inputLabel) inputLabel.innerText = 'Spend Amount (cNGN)';
    if (inputUnit) inputUnit.innerText = 'cNGN';
    if (balanceDisplay) balanceDisplay.innerText = '₦' + userCngnBalance.toLocaleString('en-NG', { maximumFractionDigits: 0 });
    if (balanceUnit) balanceUnit.innerText = 'cNGN';
    if (receiveLabel) receiveLabel.innerText = 'You will receive:';

    if (card1Label) card1Label.innerText = 'You Pay';
    if (card1BalLabel) card1BalLabel.innerText = 'Available:';
    if (card1Bal) card1Bal.innerText = '₦' + Math.floor(userCngnBalance).toLocaleString('en-NG');
    if (card1BalUnit) card1BalUnit.innerText = 'cNGN';
    if (card1Icon) card1Icon.innerText = '💰';
    if (card1Unit) card1Unit.innerText = 'cNGN';
    if (card1SubVal) card1SubVal.innerText = '≈ ₦' + amountInput.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (card2Label) card2Label.innerText = 'You Receive';
    if (card2BalLabel) card2BalLabel.innerText = 'Holding:';
    if (card2Bal) card2Bal.innerText = Math.round(userTokenBalance).toLocaleString('en-NG');
    if (card2BalUnit) card2BalUnit.innerText = '$' + selectedToken.symbol;
    if (card2Icon) card2Icon.innerText = '🪙';
    if (card2Unit) card2Unit.innerText = '$' + selectedToken.symbol;

    const platformFee = amountInput * 0.01;
    const creatorFee = amountInput * 0.0035;
    const netAmount = Math.max(0, amountInput - platformFee - creatorFee);

    document.getElementById('platformFeeText').innerText = '₦' + platformFee.toLocaleString('en-NG', { maximumFractionDigits: 2 }) + ' cNGN';
    document.getElementById('creatorFeeText').innerText = '₦' + creatorFee.toLocaleString('en-NG', { maximumFractionDigits: 2 }) + ' cNGN';

    const tokensOut = priceCngn > 0 ? (netAmount / priceCngn) : 0;
    const tokensOutRounded = Math.round(tokensOut);

    if (receiveAmountEl) receiveAmountEl.innerText = tokensOutRounded.toLocaleString('en-NG');
    if (card2SubVal) card2SubVal.innerText = '≈ ₦' + (tokensOutRounded * priceCngn).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const balancePct = userCngnBalance > 0 ? ((amountInput / userCngnBalance) * 100).toFixed(1) : 0;
    const virtualCngn = selectedToken.virtualCngn || 2500000;
    const priceImpactPct = virtualCngn > 0 ? ((netAmount / virtualCngn) * 100) : 0;
    const impactColor = priceImpactPct > 5 ? '#F87171' : priceImpactPct > 2 ? '#FCD34D' : '#86EFAC';

    const estOld = document.getElementById('estimatedTokensReceived');
    if (estOld) {
      estOld.innerHTML =
        `<span>${tokensOutRounded.toLocaleString()} $${selectedToken.symbol}</span>` +
        (balancePct > 0 ? `<span style="font-size:10px;color:#94A3B8;margin-left:6px;">(${balancePct}% of balance)</span>` : '') +
        (priceImpactPct > 0.01 ? `<span style="font-size:10px;color:${impactColor};margin-left:6px;">~${priceImpactPct.toFixed(2)}% impact</span>` : '');
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.cursor = 'pointer';
      submitBtn.style.background = 'linear-gradient(135deg, #00FF87, #008751)';
      submitBtn.style.color = '#06080C';

      if (isGraduated) {
        submitBtn.innerText = amountInput > 0
          ? `⚡ Buy $${selectedToken.symbol} (DEX Route)`
          : `⚡ Buy $${selectedToken.symbol} via DEX`;
      } else {
        submitBtn.innerText = amountInput > 0
          ? 'Buy $' + selectedToken.symbol + ' for ₦' + amountInput.toLocaleString('en-NG') + ' cNGN'
          : 'Buy $' + selectedToken.symbol;
      }
    }
  } else {
    // --- SELL MODE ---
    if (inputLabel) inputLabel.innerText = `Tokens to Sell ($${selectedToken.symbol})`;
    if (inputUnit) inputUnit.innerText = `$${selectedToken.symbol}`;
    if (balanceDisplay) balanceDisplay.innerText = Math.round(userTokenBalance).toLocaleString('en-NG');
    if (balanceUnit) balanceUnit.innerText = '$' + selectedToken.symbol;
    if (receiveLabel) receiveLabel.innerText = 'Estimated Proceeds (cNGN):';

    if (card1Label) card1Label.innerText = 'You Sell';
    if (card1BalLabel) card1BalLabel.innerText = 'Available:';
    if (card1Bal) card1Bal.innerText = Math.round(userTokenBalance).toLocaleString('en-NG');
    if (card1BalUnit) card1BalUnit.innerText = '$' + selectedToken.symbol;
    if (card1Icon) card1Icon.innerText = '🪙';
    if (card1Unit) card1Unit.innerText = '$' + selectedToken.symbol;
    if (card1SubVal) card1SubVal.innerText = '≈ ₦' + (amountInput * priceCngn).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (card2Label) card2Label.innerText = 'You Receive';
    if (card2BalLabel) card2BalLabel.innerText = 'Balance:';
    if (card2Bal) card2Bal.innerText = '₦' + Math.floor(userCngnBalance).toLocaleString('en-NG');
    if (card2BalUnit) card2BalUnit.innerText = 'cNGN';
    if (card2Icon) card2Icon.innerText = '💰';
    if (card2Unit) card2Unit.innerText = 'cNGN';

    const grossCngn = amountInput * priceCngn;
    const platformFee = grossCngn * 0.01;
    const creatorFee = grossCngn * 0.0035;
    const netCngn = Math.max(0, grossCngn - platformFee - creatorFee);

    document.getElementById('platformFeeText').innerText = '₦' + platformFee.toLocaleString('en-NG', { maximumFractionDigits: 2 }) + ' cNGN';
    document.getElementById('creatorFeeText').innerText = '₦' + creatorFee.toLocaleString('en-NG', { maximumFractionDigits: 2 }) + ' cNGN';

    if (receiveAmountEl) receiveAmountEl.innerText = '₦' + Math.round(netCngn).toLocaleString('en-NG');
    if (card2SubVal) card2SubVal.innerText = '≈ ₦' + netCngn.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' cNGN';

    const tokenBalancePct = userTokenBalance > 0 ? ((amountInput / userTokenBalance) * 100).toFixed(1) : 0;
    const virtualCngn = selectedToken.virtualCngn || 2500000;
    const priceImpactPct = virtualCngn > 0 ? ((grossCngn / virtualCngn) * 100) : 0;
    const impactColor = priceImpactPct > 5 ? '#F87171' : priceImpactPct > 2 ? '#FCD34D' : '#86EFAC';

    const estOld = document.getElementById('estimatedTokensReceived');
    if (estOld) {
      estOld.innerHTML =
        `<span>₦${netCngn.toLocaleString('en-NG', { maximumFractionDigits: 2 })} cNGN</span>` +
        (tokenBalancePct > 0 ? `<span style="font-size:10px;color:#94A3B8;margin-left:6px;">(${tokenBalancePct}% of holdings)</span>` : '') +
        (priceImpactPct > 0.01 ? `<span style="font-size:10px;color:${impactColor};margin-left:6px;">~${priceImpactPct.toFixed(2)}% impact</span>` : '');
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.cursor = 'pointer';
      submitBtn.style.background = 'linear-gradient(135deg, #EF4444, #DC2626)';
      submitBtn.style.color = '#FFF';

      if (isGraduated) {
        submitBtn.innerText = amountInput > 0
          ? `⚡ Sell $${selectedToken.symbol} (DEX Route)`
          : `⚡ Sell $${selectedToken.symbol} via DEX`;
      } else {
        submitBtn.innerText = amountInput > 0
          ? 'Sell $' + selectedToken.symbol + ' for ₦' + Math.round(netCngn).toLocaleString('en-NG') + ' cNGN'
          : 'Sell $' + selectedToken.symbol;
      }
    }
  }
}

// Function to switch between Buy and Sell modes cleanly
function setTradeMode(mode) {
  currentTradeTab = mode;
  const tabBuy = document.getElementById('tabBuy');
  const tabSell = document.getElementById('tabSell');
  if (tabBuy && tabSell) {
    if (mode === 'buy') {
      tabBuy.style.background = 'var(--kobo-green)';
      tabBuy.style.color = '#041008';
      tabSell.style.background = 'transparent';
      tabSell.style.color = 'var(--text-secondary)';
    } else {
      tabSell.style.background = '#EF4444';
      tabSell.style.color = '#FFF';
      tabBuy.style.background = 'transparent';
      tabBuy.style.color = 'var(--text-secondary)';
    }
  }

  // Clear any existing error on mode switch
  const statusBox = document.getElementById('tradeStatusBox');
  if (statusBox) statusBox.style.display = 'none';

  // Default input value on mode switch
  const inputEl = document.getElementById('tradeAmountInput');
  if (inputEl) {
    if (mode === 'buy') {
      inputEl.value = '5,000';
    } else {
      const half = Math.floor(userTokenBalance * 0.5);
      inputEl.value = half > 0 ? half.toLocaleString('en-NG') : '0';
    }
  }

  // Reset chip active styles
  document.querySelectorAll('.pct-chip').forEach(c => {
    c.style.background = 'rgba(255,255,255,0.05)';
    c.style.border = '1px solid rgba(255,255,255,0.1)';
    c.style.color = c.getAttribute('data-pct') === '100' ? 'var(--kobo-green)' : 'var(--text-secondary)';
  });

  updateTradeCalculation();
}

// Attach Tab Listeners
const tabBuyBtn = document.getElementById('tabBuy');
if (tabBuyBtn) {
  tabBuyBtn.addEventListener('click', () => setTradeMode('buy'));
}

const tabSellBtn = document.getElementById('tabSell');
if (tabSellBtn) {
  tabSellBtn.addEventListener('click', () => setTradeMode('sell'));
}

// Invert Trade Button (Central flip button from sample image)
const btnInvertTrade = document.getElementById('btnInvertTrade');
if (btnInvertTrade) {
  btnInvertTrade.addEventListener('click', () => {
    const newMode = currentTradeTab === 'buy' ? 'sell' : 'buy';
    setTradeMode(newMode);
  });
}

// Format input with commas dynamically as user types (e.g. 123,456)
const tradeAmountInput = document.getElementById('tradeAmountInput');
if (tradeAmountInput) {
  tradeAmountInput.addEventListener('input', (e) => {
    // Auto-hide old error whenever user begins typing
    const statusBox = document.getElementById('tradeStatusBox');
    if (statusBox) statusBox.style.display = 'none';

    // Strip non-numeric characters then reformat with commas
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw === '') {
      e.target.value = '';
    } else {
      const num = parseInt(raw, 10);
      e.target.value = num.toLocaleString('en-NG');
    }
    updateTradeCalculation();
  });
}

// Parse formatted input value
function getTradeAmount() {
  const el = document.getElementById('tradeAmountInput');
  if (!el) return 0;
  const raw = el.value.replace(/[^0-9.]/g, '');
  return parseFloat(raw) || 0;
}

// Percentage Quick-Select Chips (25% / 50% / 75% / 100% as in sample image)
document.querySelectorAll('.pct-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    // Clear any previous error box
    const statusBox = document.getElementById('tradeStatusBox');
    if (statusBox) statusBox.style.display = 'none';

    const pct = parseInt(chip.getAttribute('data-pct'), 10) / 100;

    // Active highlight: reset all chips then highlight selected
    document.querySelectorAll('.pct-chip').forEach(c => {
      c.style.background = 'rgba(255,255,255,0.05)';
      c.style.border = '1px solid rgba(255,255,255,0.1)';
      c.style.color = c.getAttribute('data-pct') === '100' ? 'var(--kobo-green)' : 'var(--text-secondary)';
    });
    chip.style.background = 'rgba(0,255,135,0.12)';
    chip.style.border = '1px solid rgba(0,255,135,0.4)';
    chip.style.color = '#00FF87';

    let val = 0;
    if (currentTradeTab === 'buy') {
      // % of cNGN balance
      val = Math.floor(userCngnBalance * pct);
    } else {
      // % of token holdings
      val = Math.floor(userTokenBalance * pct);
    }

    const input = document.getElementById('tradeAmountInput');
    if (input) {
      input.value = val > 0 ? val.toLocaleString('en-NG') : '0';
    }
    updateTradeCalculation();
  });

  // Hover effect
  chip.addEventListener('mouseenter', () => {
    if (chip.style.background !== 'rgba(0,255,135,0.12)') {
      chip.style.background = 'rgba(255,255,255,0.09)';
    }
  });
  chip.addEventListener('mouseleave', () => {
    if (chip.style.background !== 'rgba(0,255,135,0.12)') {
      chip.style.background = 'rgba(255,255,255,0.05)';
    }
  });
});



// Real On-Chain Trade Form Submit
document.getElementById('tradeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedToken) return;

  const amount = getTradeAmount();

  if (amount <= 0) {
    showTradeStatus('Please enter an amount greater than zero.', 'error');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitTrade');
  submitBtn.disabled = true;

  try {
    // 1. Resolve User Signer
    showTradeStatus('Connecting to your logged-in wallet on Base Sepolia...', 'info');
    const signer = await getUserSigner();
    if (!signer) {
      showTradeStatus('Wallet not ready! Please connect your wallet.', 'error');
      if (window.openDynamicModal) window.openDynamicModal();
      submitBtn.disabled = false;
      return;
    }

    const activeAddress = await signer.getAddress();
    userWalletAddress = activeAddress;
    console.log('⚡ [Trade] Active Signer Address:', activeAddress);

    const accEl = document.getElementById('tradeAccountDisplay');
    if (accEl) accEl.innerText = shortenAddress(activeAddress);

    // 2. Check Gas (Base Sepolia ETH)
    showTradeStatus('Verifying Base Sepolia ETH for transaction gas...', 'info');
    const hasGas = await checkGasSufficient(activeAddress);
    if (!hasGas) {
      submitBtn.disabled = false;
      return;
    }

    const curveAddress = appConfig?.bondingCurveAddress || '0x50300237A5c8AFb7d7D56F8c08FBaa22EB92E203';
    const cngnAddress = appConfig?.cngnAddress || '0xDdc8B9e1Afdcc3136212c8642d253285c2Bc237c';
    const treasuryAddress = appConfig?.treasuryAddress || '0x959C2c33419b009ce02113BFAee45d4ae72981f8';

    // ========================================================
    // PATHWAY A: GRADUATED COIN (100% ON-CHAIN KOBO AMM DEX ROUTE)
    // ========================================================
    if (selectedToken.graduated) {
      const ammRouterAddress = appConfig?.ammRouterAddress || '0xA862739c8755fa83FE1B75021Af6f7D438EC6c80';
      const ammFactoryAddress = appConfig?.ammFactoryAddress || '0x01aEA417df786883364721Af2A8238bf02d1AD2F';
      const routerContract = new ethers.Contract(ammRouterAddress, KOBO_AMM_ROUTER_ABI, signer);

      // Verify or initialize AMM Liquidity Pair
      try {
        const factoryContract = new ethers.Contract(ammFactoryAddress, KOBO_AMM_FACTORY_ABI, signer);
        let pairAddress = await factoryContract.getPair(cngnAddress, selectedToken.address);
        if (!pairAddress || pairAddress === ethers.ZeroAddress) {
          showTradeStatus(`⚙️ Initializing autonomous AMM Pair & liquidity for $${selectedToken.symbol} on Base Sepolia...`, 'info');
          const pairRes = await fetch('/api/amm/ensure-pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenAddress: selectedToken.address, tokenSymbol: selectedToken.symbol })
          });
          const pairData = await pairRes.json();
          if (pairData.success && pairData.pairAddress) {
            console.log('✅ AMM Pair initialized:', pairData.pairAddress);
          }
        }
      } catch (pairCheckErr) {
        console.warn('Pair check / auto-init notice:', pairCheckErr);
      }

      if (currentTradeTab === 'buy') {
        // --- DEX BUY (cNGN -> $TOKEN) ---
        const cngnContract = new ethers.Contract(cngnAddress, CNGN_ABI, signer);
        const cngnBalUnits = await cngnContract.balanceOf(activeAddress);
        const cngnBal = Number(ethers.formatUnits(cngnBalUnits, 6));
        userCngnBalance = cngnBal;
        updateBalancesInUI();

        if (cngnBal < amount) {
          showTradeStatus(`
            <div style="font-weight: 800; font-size: 13px; margin-bottom: 4px; color: #FCA5A5;">⚠️ Insufficient cNGN!</div>
            <div style="margin-bottom: 8px; color: #E2E8F0; line-height: 1.4;">
              Your balance is <b>₦${cngnBal.toLocaleString()} cNGN</b>. You need <b>₦${amount.toLocaleString()} cNGN</b> to execute this DEX swap.
            </div>
            <button type="button" onclick="openAccountHub('tab-convert')" class="btn-kobo" style="padding: 8px 16px; font-size: 12px; font-weight: 700;">
              🔄 Convert Deposited Naira to cNGN
            </button>
          `, 'error');
          submitBtn.disabled = false;
          return;
        }

        const cngnInUnits = ethers.parseUnits(amount.toString(), 6);

        // 1. Check & Approve cNGN allowance for Kobo AMM Router
        const allowance = await cngnContract.allowance(activeAddress, ammRouterAddress);
        if (allowance < cngnInUnits) {
          showTradeStatus('🔑 Approving cNGN for Kobo AMM DEX Router on Base Sepolia... Please confirm in wallet', 'info');
          submitBtn.innerText = 'Approving cNGN...';
          const approveTx = await cngnContract.approve(ammRouterAddress, ethers.MaxUint256);
          showTradeStatus(`⚡ Approval broadcasted (${shortenAddress(approveTx.hash)}). Confirming on Base Sepolia...`, 'info');
          await approveTx.wait();
        }

        // 2. Fetch expected tokens out from on-chain AMM Router
        showTradeStatus('🧮 Calculating spot output from Base Sepolia AMM pool...', 'info');
        submitBtn.innerText = 'Calculating Route...';
        let amountsOut;
        try {
          amountsOut = await routerContract.getAmountsOut(cngnInUnits, [cngnAddress, selectedToken.address]);
        } catch (quoteErr) {
          console.warn('getAmountsOut error, ensuring pair:', quoteErr);
          await fetch('/api/amm/ensure-pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenAddress: selectedToken.address, tokenSymbol: selectedToken.symbol })
          }).catch(() => {});
          amountsOut = await routerContract.getAmountsOut(cngnInUnits, [cngnAddress, selectedToken.address]);
        }
        const expectedTokens = amountsOut[1];
        const minTokensOut = (expectedTokens * 90n) / 100n; // 10% slippage protection for DEX trades
        const tokensExpectedNum = Number(ethers.formatUnits(expectedTokens, 18));

        // 3. Execute Swap on-chain
        showTradeStatus(`⏳ Swapping ₦${amount.toLocaleString()} cNGN for ${Math.round(tokensExpectedNum).toLocaleString()} $${selectedToken.symbol}... Please confirm in wallet`, 'info');
        submitBtn.innerText = 'Confirm in Wallet...';
        let swapTx;
        try {
          const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes
          swapTx = await routerContract.swapExactTokensForTokens(
            cngnInUnits,
            minTokensOut,
            [cngnAddress, selectedToken.address],
            activeAddress,
            deadline
          );
          showTradeStatus(`⚡ Swap broadcasted (${shortenAddress(swapTx.hash)}). Waiting for Base Sepolia block confirmation...`, 'info');
          submitBtn.innerText = 'Confirming Swap...';
          await swapTx.wait();
        } catch (swapErr) {
          console.error('DEX Swap failed:', swapErr);
          let errMsg = swapErr.message || 'Swap transaction failed';
          if (errMsg.includes('user rejected') || errMsg.includes('ACTION_REJECTED')) {
            errMsg = 'Transaction was cancelled in wallet.';
          } else if (errMsg.includes('INSUFFICIENT_OUTPUT_AMOUNT')) {
            errMsg = 'Price moved! Slippage exceeded. Please try again.';
          } else if (errMsg.includes('PAIR_DOES_NOT_EXIST')) {
            errMsg = 'AMM Liquidity Pair is initializing. Please retry in a moment.';
          }
          showTradeStatus(`❌ Trade Failed: ${errMsg}`, 'error');
          submitBtn.disabled = false;
          submitBtn.innerText = `⚡ Buy $${selectedToken.symbol} (DEX Route)`;
          return;
        }

        // 4. Log trade to backend for ticker & live chart
        try {
          await fetch('/api/trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              txHash: swapTx.hash,
              tokenAddress: selectedToken.address,
              tokenSymbol: selectedToken.symbol,
              isBuy: true,
              amountCngn: amount,
              tokenAmount: tokensExpectedNum,
              traderAddress: activeAddress
            })
          });
        } catch (e) {}

        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#00FF87', '#3B82F6', '#FFF'] });

        showTradeStatus(`
          <div style="font-size: 13px; font-weight: 800; color: var(--kobo-green); margin-bottom: 4px;">🎉 On-Chain DEX Swap Executed!</div>
          <div style="margin-bottom: 6px; color: #FFF;">
            You swapped <b>₦${amount.toLocaleString()} cNGN</b> and received <b>${Math.round(tokensExpectedNum).toLocaleString()} $${selectedToken.symbol}</b> directly from the autonomous AMM liquidity pool!
          </div>
          <div style="margin-top: 8px;">
            <a href="https://sepolia.basescan.org/tx/${swapTx.hash}" target="_blank" style="color: var(--kobo-green); text-decoration: underline; font-weight: 700; font-size: 11px;">
              View Verified Basescan Transaction ↗
            </a>
          </div>
        `, 'success');

        const optimisticBuyTrade = {
          isBuy: true,
          cngnAmount: amount,
          tokenAmount: tokensExpectedNum,
          traderAddress: activeAddress,
          txHash: swapTx.hash
        };
        await refreshTradeModalData(optimisticBuyTrade);
        await refreshAllData();

        submitBtn.disabled = false;
        return;

      } else {
        // --- DEX SELL ($TOKEN -> cNGN) ---
        const tokenContract = new ethers.Contract(selectedToken.address, ERC20_ABI, signer);
        const tokenUnits = ethers.parseUnits(amount.toString(), 18);
        const userTokens = await tokenContract.balanceOf(activeAddress);
        const userTokNum = Number(ethers.formatUnits(userTokens, 18));
        userTokenBalance = userTokNum;

        if (userTokNum < amount) {
          showTradeStatus(`Insufficient $${selectedToken.symbol}! You have ${Math.round(userTokNum).toLocaleString()} tokens.`, 'error');
          submitBtn.disabled = false;
          return;
        }

        // 1. Check & Approve token allowance for Kobo AMM Router
        const allowance = await tokenContract.allowance(activeAddress, ammRouterAddress);
        if (allowance < tokenUnits) {
          showTradeStatus(`🔑 Approving $${selectedToken.symbol} for Kobo AMM DEX Router on Base Sepolia... Please confirm in wallet`, 'info');
          submitBtn.innerText = `Approving $${selectedToken.symbol}...`;
          const approveTx = await tokenContract.approve(ammRouterAddress, ethers.MaxUint256);
          showTradeStatus(`⚡ Approval broadcasted (${shortenAddress(approveTx.hash)}). Confirming on Base Sepolia...`, 'info');
          await approveTx.wait();
        }

        // 2. Fetch expected cNGN out from on-chain AMM Router
        showTradeStatus('🧮 Calculating spot proceeds from Base Sepolia AMM pool...', 'info');
        submitBtn.innerText = 'Calculating Route...';
        let amountsOut;
        try {
          amountsOut = await routerContract.getAmountsOut(tokenUnits, [selectedToken.address, cngnAddress]);
        } catch (quoteErr) {
          console.warn('getAmountsOut error on sell, ensuring pair:', quoteErr);
          await fetch('/api/amm/ensure-pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenAddress: selectedToken.address, tokenSymbol: selectedToken.symbol })
          }).catch(() => {});
          amountsOut = await routerContract.getAmountsOut(tokenUnits, [selectedToken.address, cngnAddress]);
        }
        const expectedCngn = amountsOut[1];
        const minCngnOut = (expectedCngn * 90n) / 100n; // 10% slippage protection
        const cngnExpectedNum = Number(ethers.formatUnits(expectedCngn, 6));

        // 3. Execute Swap on-chain
        showTradeStatus(`⏳ Selling ${amount.toLocaleString()} $${selectedToken.symbol} for ₦${Math.round(cngnExpectedNum).toLocaleString()} cNGN... Please confirm in wallet`, 'info');
        submitBtn.innerText = 'Confirm in Wallet...';
        let swapTx;
        try {
          const deadline = Math.floor(Date.now() / 1000) + 600;
          swapTx = await routerContract.swapExactTokensForTokens(
            tokenUnits,
            minCngnOut,
            [selectedToken.address, cngnAddress],
            activeAddress,
            deadline
          );
          showTradeStatus(`⚡ Sale broadcasted (${shortenAddress(swapTx.hash)}). Waiting for Base Sepolia block confirmation...`, 'info');
          submitBtn.innerText = 'Confirming Sale...';
          await swapTx.wait();
        } catch (swapErr) {
          console.error('DEX Sale failed:', swapErr);
          let errMsg = swapErr.message || 'Sale transaction failed';
          if (errMsg.includes('user rejected') || errMsg.includes('ACTION_REJECTED')) {
            errMsg = 'Transaction was cancelled in wallet.';
          } else if (errMsg.includes('INSUFFICIENT_OUTPUT_AMOUNT')) {
            errMsg = 'Price moved! Slippage exceeded. Please try again.';
          } else if (errMsg.includes('PAIR_DOES_NOT_EXIST')) {
            errMsg = 'AMM Liquidity Pair is initializing. Please retry in a moment.';
          }
          showTradeStatus(`❌ Trade Failed: ${errMsg}`, 'error');
          submitBtn.disabled = false;
          submitBtn.innerText = `⚡ Sell $${selectedToken.symbol} (DEX Route)`;
          return;
        }

        // 4. Log trade to backend for ticker & live chart
        try {
          await fetch('/api/trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              txHash: swapTx.hash,
              tokenAddress: selectedToken.address,
              tokenSymbol: selectedToken.symbol,
              isBuy: false,
              amountCngn: cngnExpectedNum,
              tokenAmount: amount,
              traderAddress: activeAddress
            })
          });
        } catch (e) {}

        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#00FF87', '#FFFFFF'] });

        showTradeStatus(`
          <div style="font-size: 13px; font-weight: 800; color: var(--kobo-green); margin-bottom: 4px;">💸 On-Chain DEX Sale Executed!</div>
          <div style="margin-bottom: 6px; color: #FFF;">
            You sold <b>${amount.toLocaleString()} $${selectedToken.symbol}</b> and received <b>₦${cngnExpectedNum.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cNGN</b> in your wallet directly from the AMM pool!
          </div>
          <div style="margin-top: 8px;">
            <a href="https://sepolia.basescan.org/tx/${swapTx.hash}" target="_blank" style="color: var(--kobo-green); text-decoration: underline; font-weight: 700; font-size: 11px;">
              View Verified Basescan Transaction ↗
            </a>
          </div>
        `, 'success');

        const optimisticSellTrade = {
          isBuy: false,
          cngnAmount: cngnExpectedNum,
          tokenAmount: amount,
          traderAddress: activeAddress,
          txHash: swapTx.hash
        };
        await refreshTradeModalData(optimisticSellTrade);
        await refreshAllData();

        submitBtn.disabled = false;
        return;
      }
    }

    // ========================================================
    // PATHWAY B: BONDING CURVE ROUTE (Pre-graduation tokens)
    // ========================================================
    if (currentTradeTab === 'buy') {
      // ===== BUY FLOW =====
      const cngnContract = new ethers.Contract(cngnAddress, CNGN_ABI, signer);
      const curveContract = new ethers.Contract(curveAddress, KOBO_CURVE_ABI, signer);

      const cngnBalUnits = await cngnContract.balanceOf(activeAddress);
      const cngnBal = Number(ethers.formatUnits(cngnBalUnits, 6));
      userCngnBalance = cngnBal;
      updateBalancesInUI();

      if (cngnBal < amount) {
        showTradeStatus(`
          <div style="font-weight: 800; font-size: 13px; margin-bottom: 4px; color: #FCA5A5;">⚠️ Insufficient cNGN!</div>
          <div style="margin-bottom: 8px; color: #E2E8F0; line-height: 1.4;">
            Your balance is <b>₦${cngnBal.toLocaleString()} cNGN</b>. You need <b>₦${amount.toLocaleString()} cNGN</b> to buy this token.
          </div>
          <button type="button" onclick="openAccountHub('tab-deposit')" class="btn-kobo" style="padding: 8px 16px; font-size: 12px; font-weight: 700;">
            💳 Deposit Naira with Paystack
          </button>
        `, 'error');
        submitBtn.disabled = false;
        return;
      }

      const cngnInUnits = ethers.parseUnits(amount.toString(), 6);

      // Check allowance
      showTradeStatus('Checking cNGN allowance on Base Sepolia...', 'info');
      const allowance = await cngnContract.allowance(activeAddress, curveAddress);
      if (allowance < cngnInUnits) {
        showTradeStatus('⏳ Step 1/2: Approving cNGN on Base Sepolia... Please confirm in your wallet (Gas paid in ETH).', 'info');
        submitBtn.innerText = 'Approving cNGN...';
        const approveTx = await cngnContract.approve(curveAddress, ethers.MaxUint256);
        showTradeStatus(`⏳ Approval broadcasted (${shortenAddress(approveTx.hash)}). Confirming...`, 'info');
        await approveTx.wait();
        showTradeStatus('✅ cNGN approved! Now submitting buy order...', 'info');
      }

      // Execute on-chain Buy
      showTradeStatus(`⏳ Step 2/2: Buying $${selectedToken.symbol} on Base Sepolia... Please confirm in your wallet.`, 'info');
      submitBtn.innerText = 'Confirming Trade...';
      const buyTx = await curveContract.buy(selectedToken.address, cngnInUnits, 0n, { gasLimit: 500000 });
      showTradeStatus(`⚡ Trade submitted to Base Sepolia (Tx: ${shortenAddress(buyTx.hash)})! Waiting for block confirmation...`, 'info');
      const receipt = await buyTx.wait();
      console.log('✅ On-Chain Buy Confirmed:', receipt);

      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#00FF87', '#F59E0B', '#FFF'] });

      showTradeStatus(`
        <div style="font-size: 13px; font-weight: 800; color: var(--kobo-green); margin-bottom: 4px;">🎉 Transaction Confirmed on Base Sepolia!</div>
        <div style="margin-bottom: 6px; color: #FFF;">You successfully purchased <b>$${selectedToken.symbol}</b> for ₦${amount.toLocaleString()} cNGN!</div>
        <a href="https://sepolia.basescan.org/tx/${receipt.hash}" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; color: var(--kobo-green); text-decoration: underline; font-weight: 700;">
          <span>View on Basescan Explorer</span> ↗
        </a>
      `, 'success');

      // Record trade on backend ticker
      try {
        await fetch('/api/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txHash: receipt.hash,
            tokenAddress: selectedToken.address,
            tokenSymbol: selectedToken.symbol,
            isBuy: true,
            amountCngn: amount,
            tokenAmount: Math.round(amount / (selectedToken.priceKobo / 100)),
            traderAddress: activeAddress
          })
        });
      } catch (logErr) {
        console.warn('Trade logging notice:', logErr);
      }

      const approxBuyTokens = (selectedToken.priceKobo > 0) ? Math.round(amount / (selectedToken.priceKobo / 100)) : 0;
      const optimisticCurveBuy = {
        isBuy: true,
        cngnAmount: amount,
        tokenAmount: approxBuyTokens,
        traderAddress: activeAddress,
        txHash: receipt.hash
      };
      await refreshTradeModalData(optimisticCurveBuy);
      await refreshAllData();

    } else {
      // ===== SELL FLOW =====
      const tokenContract = new ethers.Contract(selectedToken.address, ERC20_ABI, signer);
      const curveContract = new ethers.Contract(curveAddress, KOBO_CURVE_ABI, signer);

      const tokenUnits = ethers.parseUnits(amount.toString(), 18);
      const userTokens = await tokenContract.balanceOf(activeAddress);

      if (userTokens < tokenUnits) {
        showTradeStatus(`Insufficient $${selectedToken.symbol}! You have ${Number(ethers.formatUnits(userTokens, 18)).toLocaleString()} tokens.`, 'error');
        submitBtn.disabled = false;
        return;
      }

      // Check allowance
      showTradeStatus(`Checking $${selectedToken.symbol} allowance on Base Sepolia...`, 'info');
      const allowance = await tokenContract.allowance(activeAddress, curveAddress);
      if (allowance < tokenUnits) {
        showTradeStatus(`⏳ Step 1/2: Approving $${selectedToken.symbol} on Base Sepolia... Please confirm in your wallet.`, 'info');
        submitBtn.innerText = 'Approving Token...';
        const approveTx = await tokenContract.approve(curveAddress, ethers.MaxUint256);
        showTradeStatus(`⏳ Approval broadcasted (${shortenAddress(approveTx.hash)}). Confirming...`, 'info');
        await approveTx.wait();
        showTradeStatus('✅ Token approved! Now cashing out...', 'info');
      }

      // Execute on-chain Sell
      showTradeStatus(`⏳ Step 2/2: Selling to cNGN on Base Sepolia... Please confirm in your wallet.`, 'info');
      submitBtn.innerText = 'Selling Tokens...';
      const sellTx = await curveContract.sell(selectedToken.address, tokenUnits, 0n, { gasLimit: 500000 });
      showTradeStatus(`⚡ Sale submitted to Base Sepolia (Tx: ${shortenAddress(sellTx.hash)})! Waiting for block confirmation...`, 'info');
      const receipt = await sellTx.wait();
      console.log('✅ On-Chain Sell Confirmed:', receipt);

      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#00FF87', '#FFFFFF'] });

      showTradeStatus(`
        <div style="font-size: 13px; font-weight: 800; color: var(--kobo-green); margin-bottom: 4px;">💸 Sale Confirmed on Base Sepolia!</div>
        <div style="margin-bottom: 6px; color: #FFF;">cNGN has been credited to your wallet balance.</div>
        <a href="https://sepolia.basescan.org/tx/${receipt.hash}" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; color: var(--kobo-green); text-decoration: underline; font-weight: 700;">
          <span>View on Basescan Explorer</span> ↗
        </a>
      `, 'success');

      const approxSellCngn = Math.round(amount * (selectedToken.priceKobo / 100));
      try {
        await fetch('/api/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txHash: receipt.hash,
            tokenAddress: selectedToken.address,
            tokenSymbol: selectedToken.symbol,
            isBuy: false,
            amountCngn: approxSellCngn,
            tokenAmount: amount,
            traderAddress: activeAddress
          })
        });
      } catch (logErr) {
        console.warn('Trade logging notice:', logErr);
      }

      const optimisticCurveSell = {
        isBuy: false,
        cngnAmount: approxSellCngn,
        tokenAmount: amount,
        traderAddress: activeAddress,
        txHash: receipt.hash
      };
      await refreshTradeModalData(optimisticCurveSell);
      await refreshAllData();
    }
  } catch (err) {
    console.error('On-chain trade execution error:', err);
    const friendlyMsg = parseTradeError(err);
    showTradeStatus(`
      <div style="font-weight:800;font-size:13px;margin-bottom:6px;">❌ Trade Failed</div>
      <div style="line-height:1.5;font-size:12px;">${friendlyMsg}</div>
    `, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = currentTradeTab === 'buy' ? 'Buy Now (On-Chain)' : 'Sell Now (On-Chain)';
    updateTradeCalculation();
  }
});

// ==========================================
// UNIFIED ACCOUNT HUB CONTROLLER
// (Deposit with Paystack, Convert 1:1, Cash Out to Bank, Gas ETH, Portfolio)
// ==========================================

let activeAccountTab = 'tab-deposit';
let userPortfolioData = [];

// Open Account Hub modal on a specific tab
window.openAccountHub = function(tabName = 'tab-deposit') {
  if (!userWalletAddress) {
    // If not connected, prompt Dynamic auth flow
    if (window.openDynamicModal) {
      window.openDynamicModal();
      return;
    }
  }

  const modal = document.getElementById('accountHubModal');
  if (!modal) return;

  modal.classList.add('active');
  switchAccountTab(tabName);
  updateBalancesInUI();

  // If opening portfolio tab, auto-fetch
  if (tabName === 'tab-portfolio') {
    loadUserPortfolio();
  }
};

// Switch tabs inside Account Hub
function switchAccountTab(tabKey) {
  activeAccountTab = tabKey;

  // Update tab buttons
  document.querySelectorAll('.account-tab-btn').forEach(btn => {
    const isTarget = btn.getAttribute('data-tab') === tabKey;
    btn.style.background = isTarget ? 'var(--kobo-green)' : 'transparent';
    btn.style.color = isTarget ? '#041008' : 'var(--text-secondary)';
    btn.style.fontWeight = isTarget ? '700' : '600';
    if (isTarget) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  // Toggle tab panels
  const tabPanels = {
    'tab-deposit': document.getElementById('hubTabDeposit'),
    'tab-buysell': document.getElementById('hubTabBuysell'),
    'tab-send': document.getElementById('hubTabSend'),
    'tab-withdraw': document.getElementById('hubTabWithdraw'),
    'tab-gas': document.getElementById('hubTabGas'),
    'tab-portfolio': document.getElementById('hubTabPortfolio')
  };

  Object.keys(tabPanels).forEach(key => {
    if (tabPanels[key]) {
      tabPanels[key].style.display = (key === tabKey) ? 'block' : 'none';
    }
  });

  // Hide old alert banner on tab switch
  const alertEl = document.getElementById('hubStatusAlert');
  if (alertEl) alertEl.style.display = 'none';

  // Pane-specific actions
  if (tabKey === 'tab-portfolio') {
    loadUserPortfolio();
  } else if (tabKey === 'tab-send') {
    if (typeof updateSendAssetUI === 'function') updateSendAssetUI();
    if (typeof populateSendTokensDropdown === 'function') populateSendTokensDropdown();
  } else if (tabKey === 'tab-buysell') {
    if (typeof updateBuySellCalc === 'function') updateBuySellCalc();
  } else if (tabKey === 'tab-withdraw') {
    const maxSpan = document.getElementById('hubMaxWithdrawCngn');
    if (maxSpan) maxSpan.innerText = '₦' + Math.floor(userCngnBalance).toLocaleString();
  }
}

// Attach tab click handlers
document.querySelectorAll('.account-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-tab');
    if (tab) switchAccountTab(tab);
  });
});

// Helper for status alert inside Account Hub
function showHubStatus(text, type = 'info') {
  const el = document.getElementById('hubStatusAlert');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = text;
  if (type === 'success') {
    el.style.backgroundColor = 'rgba(0, 255, 135, 0.12)';
    el.style.border = '1px solid rgba(0, 255, 135, 0.35)';
    el.style.color = 'var(--kobo-green)';
  } else if (type === 'error') {
    el.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
    el.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    el.style.color = '#F87171';
  } else {
    el.style.backgroundColor = 'rgba(99, 102, 241, 0.15)';
    el.style.border = '1px solid rgba(99, 102, 241, 0.35)';
    el.style.color = '#C7D2FE';
  }
}

// Copy Hub Address to clipboard
const btnCopyHubAddr = document.getElementById('btnCopyHubAddress');
if (btnCopyHubAddr) {
  btnCopyHubAddr.addEventListener('click', () => {
    if (!userWalletAddress) return;
    navigator.clipboard.writeText(userWalletAddress);
    btnCopyHubAddr.innerText = '✓ Copied!';
    setTimeout(() => { btnCopyHubAddr.innerText = '📋 Copy'; }, 2000);
  });
}

// Sign Out from Account Hub
const btnHubSignOut = document.getElementById('btnHubSignOut');
if (btnHubSignOut) {
  btnHubSignOut.addEventListener('click', () => {
    if (window.dynamicLogOut) {
      window.dynamicLogOut();
    }
    userWalletAddress = null;
    userNairaBalance = 0;
    userCngnBalance = 0;
    userEthBalance = 0;
    const modal = document.getElementById('accountHubModal');
    if (modal) modal.classList.remove('active');
    updateBalancesInUI();
  });
}

// ----------------------------------------------------
// TAB 1: DEPOSIT (PAYSTACK → cNGN at 1:1)
// ----------------------------------------------------
// Deposit Preset Chips
document.querySelectorAll('.hub-deposit-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.hub-deposit-chip').forEach(c => {
      c.style.background = 'var(--bg-elevated)';
      c.style.borderColor = 'var(--border-subtle)';
      c.style.color = 'var(--text-secondary)';
      c.classList.remove('active');
    });
    chip.style.background = 'rgba(0, 255, 135, 0.15)';
    chip.style.borderColor = 'var(--kobo-green)';
    chip.style.color = '#FFF';
    chip.classList.add('active');

    const val = chip.getAttribute('data-val');
    const input = document.getElementById('hubDepositAmount');
    if (input && val) {
      const num = parseInt(val, 10);
      input.value = num > 0 ? num.toLocaleString('en-NG') : val;
    }
  });
});

// Format hub deposit input with commas dynamically as user types (e.g. 10,000,000)
const hubDepositAmountInput = document.getElementById('hubDepositAmount');
if (hubDepositAmountInput) {
  hubDepositAmountInput.addEventListener('input', (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw === '') {
      e.target.value = '';
    } else {
      const num = parseInt(raw, 10);
      e.target.value = num.toLocaleString('en-NG');
    }
    document.querySelectorAll('.hub-deposit-chip').forEach(c => {
      const cVal = c.getAttribute('data-val');
      if (cVal === raw) {
        c.style.background = 'rgba(0, 255, 135, 0.15)';
        c.style.borderColor = 'var(--kobo-green)';
        c.style.color = '#FFF';
        c.classList.add('active');
      } else {
        c.style.background = 'var(--bg-elevated)';
        c.style.borderColor = 'var(--border-subtle)';
        c.style.color = 'var(--text-secondary)';
        c.classList.remove('active');
      }
    });
  });
}

// Execute Paystack Deposit
const btnHubDeposit = document.getElementById('btnHubExecuteDeposit');
if (btnHubDeposit) {
  btnHubDeposit.addEventListener('click', () => {
    const emailInput = document.getElementById('hubDepositEmail');
    const amountInput = document.getElementById('hubDepositAmount');
    const email = emailInput?.value.trim() || 'trader@kobo.xyz';
    const rawAmt = amountInput?.value.replace(/[^0-9.]/g, '') || '';
    const amount = parseFloat(rawAmt) || 0;
    const publicKey = appConfig?.paystackPublicKey || 'pk_test_e4af71e0fdd90c6de06dfbaa0cd315397f5a230c';

    if (amount <= 0) {
      showHubStatus('Please enter a valid deposit amount in Naira.', 'error');
      return;
    }

    if (!userWalletAddress) {
      if (window.dynamicAddress) {
        userWalletAddress = window.dynamicAddress;
      } else {
        userWalletAddress = getOrCreateSocialSessionWallet(window.dynamicUser || { id: 'kobo_user' });
      }
      updateBalancesInUI();
    }

    btnHubDeposit.disabled = true;
    btnHubDeposit.innerText = 'Opening Paystack Checkout...';
    showHubStatus('Launching Paystack secure checkout popup...', 'info');

    const amountKobo = Math.round(amount * 100);

    const handlePaystackSuccess = async (reference) => {
      btnHubDeposit.disabled = true;
      btnHubDeposit.innerText = 'Verifying & Minting cNGN...';
      showHubStatus('Verifying payment on Paystack and transferring cNGN on Base Sepolia...', 'info');

      try {
        const verifyRes = await fetch('/api/paystack/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: reference,
            walletAddress: userWalletAddress,
            amountNgn: amount
          })
        });
        const vData = await verifyRes.json();

        if (vData.success) {
          userNairaBalance = (typeof vData.nairaBalance === 'number') ? vData.nairaBalance : (userNairaBalance + amount);
          lastDepositLockTimestamp = Date.now();
          lastDepositLockedAmount = userNairaBalance;
          confetti({ particleCount: 120, spread: 80, colors: ['#00FF87', '#FFFFFF', '#F59E0B'] });
          showHubStatus(`
            <div style="font-weight: 800; font-size: 14px; color: var(--kobo-green); margin-bottom: 4px;">🎉 Naira Deposit Confirmed!</div>
            <div>₦${amount.toLocaleString()} NGN has been credited to your in-app Naira balance.</div>
            <div style="margin-top: 10px;">
              <button type="button" onclick="switchAccountTab('tab-buysell')" class="btn-kobo" style="padding: 8px 16px; font-size: 12px; font-weight: 700;">
                💱 Convert to cNGN Now (Zero Fees) ➔
              </button>
            </div>
          `, 'success');
          updateBalancesInUI();
        } else {
          showHubStatus(vData.message || 'Payment verification encountered an issue.', 'error');
        }
      } catch (err) {
        showHubStatus('Verification network error: ' + err.message, 'error');
      } finally {
        btnHubDeposit.disabled = false;
        btnHubDeposit.innerText = '💳 Pay with Paystack (Test Checkout)';
      }
    };

    // 1. Try Paystack V2
    if (typeof window.PaystackPop === 'function') {
      try {
        const paystack = new window.PaystackPop();
        paystack.newTransaction({
          key: publicKey,
          email: email,
          amount: amountKobo,
          currency: 'NGN',
          metadata: {
            wallet_address: userWalletAddress,
            custom_fields: [
              { display_name: 'Wallet Address', variable_name: 'wallet_address', value: userWalletAddress }
            ]
          },
          onSuccess: (transaction) => {
            console.log('✅ Paystack V2 Success:', transaction);
            handlePaystackSuccess(transaction.reference);
          },
          onCancel: () => {
            btnHubDeposit.disabled = false;
            btnHubDeposit.innerText = '💳 Pay with Paystack (Test Checkout)';
            showHubStatus('Paystack checkout window was closed.', 'info');
          }
        });
        return;
      } catch (v2Err) {
        console.warn('Paystack V2 notice, falling back to V1:', v2Err);
      }
    }

    // 2. Fallback to Paystack V1
    if (window.PaystackPop && window.PaystackPop.setup) {
      try {
        const handler = window.PaystackPop.setup({
          key: publicKey,
          email: email,
          amount: amountKobo,
          currency: 'NGN',
          ref: 'KOBO_' + Math.floor(Math.random() * 1000000000 + 1),
          metadata: {
            custom_fields: [
              { display_name: 'Wallet Address', variable_name: 'wallet_address', value: userWalletAddress }
            ]
          },
          callback: (response) => {
            console.log('✅ Paystack V1 Success:', response);
            handlePaystackSuccess(response.reference);
          },
          onClose: () => {
            btnHubDeposit.disabled = false;
            btnHubDeposit.innerText = '💳 Pay with Paystack (Test Checkout)';
            showHubStatus('Paystack popup closed.', 'info');
          }
        });
        handler.openIframe();
        return;
      } catch (v1Err) {
        console.error('Paystack V1 error:', v1Err);
      }
    }

    btnHubDeposit.disabled = false;
    btnHubDeposit.innerText = '💳 Pay with Paystack (Test Checkout)';
    showHubStatus('Could not open Paystack window. Please check your network or adblocker.', 'error');
  });
}

// ----------------------------------------------------
// TAB 2: CONVERT NAIRA ⇄ cNGN (Instant 1:1 Parity)
// ----------------------------------------------------
let activeBuySellMode = 'buy';

window.switchBuySellTab = function(mode) {
  activeBuySellMode = mode;
  const btnBuy = document.getElementById('buysellTabBuy');
  const btnSell = document.getElementById('buysellTabSell');
  const paneBuy = document.getElementById('buysellPaneBuy');
  const paneSell = document.getElementById('buysellPaneSell');

  if (mode === 'buy') {
    if (btnBuy) { btnBuy.style.background = 'var(--kobo-green)'; btnBuy.style.color = '#041008'; }
    if (btnSell) { btnSell.style.background = 'transparent'; btnSell.style.color = 'var(--text-secondary)'; }
    if (paneBuy) paneBuy.style.display = 'block';
    if (paneSell) paneSell.style.display = 'none';
  } else {
    if (btnSell) { btnSell.style.background = '#10B981'; btnSell.style.color = '#FFF'; }
    if (btnBuy) { btnBuy.style.background = 'transparent'; btnBuy.style.color = 'var(--text-secondary)'; }
    if (paneSell) paneSell.style.display = 'block';
    if (paneBuy) paneBuy.style.display = 'none';
  }
  updateBuySellCalc();
};

window.setBuyCngnMax = function() {
  const buyInput = document.getElementById('buysellBuyAmount');
  if (buyInput) {
    const val = Math.floor(userNairaBalance);
    buyInput.value = val > 0 ? val.toLocaleString('en-NG') : '0';
    updateBuySellCalc();
  }
};

window.updateBuySellCalc = function() {
  const nairaAvail = document.getElementById('buysellNairaAvailable');
  if (nairaAvail) {
    nairaAvail.innerText = Math.floor(userNairaBalance).toLocaleString('en-NG');
  }

  const buyInput = document.getElementById('buysellBuyAmount');
  const buyReceive = document.getElementById('buysellBuyReceive');
  if (buyInput && buyReceive) {
    const val = parseFloat(buyInput.value.replace(/[^0-9.]/g, '')) || 0;
    buyReceive.innerText = val.toLocaleString('en-NG');
  }

  const sellInput = document.getElementById('buysellSellAmount');
  const sellReceive = document.getElementById('buysellSellReceive');
  const sellMax = document.getElementById('buysellSellMax');
  if (sellMax) sellMax.innerText = Math.floor(userCngnBalance).toLocaleString('en-NG');
  if (sellInput && sellReceive) {
    const val = parseFloat(sellInput.value.replace(/[^0-9.]/g, '')) || 0;
    sellReceive.innerText = val.toLocaleString('en-NG');
  }
};

const buysellBuyInput = document.getElementById('buysellBuyAmount');
if (buysellBuyInput) {
  buysellBuyInput.addEventListener('input', (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw === '') {
      e.target.value = '';
    } else {
      const num = parseInt(raw, 10);
      e.target.value = num.toLocaleString('en-NG');
    }
    updateBuySellCalc();
  });
}
const buysellSellInput = document.getElementById('buysellSellAmount');
if (buysellSellInput) {
  buysellSellInput.addEventListener('input', (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw === '') {
      e.target.value = '';
    } else {
      const num = parseInt(raw, 10);
      e.target.value = num.toLocaleString('en-NG');
    }
    updateBuySellCalc();
  });
}

// Execute Convert Naira -> cNGN (NO Paystack prompt - Uses deposited Naira balance!)
const btnExecuteBuyCngn = document.getElementById('btnExecuteBuyCngn');
if (btnExecuteBuyCngn) {
  btnExecuteBuyCngn.addEventListener('click', async () => {
    if (!userWalletAddress) {
      showHubStatus('Please connect your wallet or log in first.', 'error');
      return;
    }
    const amt = parseFloat(document.getElementById('buysellBuyAmount')?.value.replace(/[^0-9.]/g, '')) || 0;
    if (amt <= 0) {
      showHubStatus('Please enter an amount of Naira greater than zero.', 'error');
      return;
    }
    if (amt > userNairaBalance) {
      showHubStatus(`
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#FCA5A5;">⚠️ Insufficient Deposited Naira Balance!</div>
        <div style="margin-bottom:8px;color:#E2E8F0;font-size:12px;">Your available Naira balance is <b>₦${userNairaBalance.toLocaleString('en-NG')} NGN</b>. You requested ₦${amt.toLocaleString('en-NG')} NGN.</div>
        <button type="button" onclick="switchAccountTab('tab-deposit')" class="btn-kobo" style="padding:6px 14px;font-size:11px;">💳 Deposit Naira with Paystack</button>
      `, 'error');
      return;
    }

    btnExecuteBuyCngn.disabled = true;
    btnExecuteBuyCngn.innerText = 'Converting to cNGN on Base Sepolia...';
    showHubStatus('⏳ Converting your deposited Naira into cNGN on Base Sepolia... Zero card charge.', 'info');

    try {
      const res = await fetch('/api/account/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: userWalletAddress,
          fromCurrency: 'NGN',
          toCurrency: 'cNGN',
          amount: amt
        })
      });
      const data = await res.json();
      if (data.success) {
        userNairaBalance = (typeof data.remainingNaira === 'number') ? data.remainingNaira : Math.max(0, userNairaBalance - amt);
        lastDepositLockTimestamp = 0;
        lastDepositLockedAmount = userNairaBalance;
        userCngnBalance += amt;
        confetti({ particleCount: 120, spread: 80, colors: ['#00FF87', '#FFFFFF', '#F59E0B'] });
        showHubStatus(`
          <div style="font-weight:800;color:var(--kobo-green);margin-bottom:4px;">🎉 Conversion Successful!</div>
          <div style="color:#FFF;margin-bottom:6px;">Converted <b>₦${amt.toLocaleString('en-NG')} NGN</b> into <b>₦${amt.toLocaleString('en-NG')} cNGN</b> on Base Sepolia!</div>
          <div style="font-size:11px;color:#94A3B8;">Your wallet is now funded with cNGN and ready to trade memecoins on-chain.</div>
        `, 'success');
        updateBalancesInUI();
      } else {
        showHubStatus(`Conversion failed: ${data.message}`, 'error');
      }
    } catch (err) {
      showHubStatus(`Conversion network error: ${err.message}`, 'error');
    } finally {
      btnExecuteBuyCngn.disabled = false;
      btnExecuteBuyCngn.innerText = '🔄 Convert Naira to cNGN (Instant 1:1)';
      updateBalancesInUI();
    }
  });
}

// Execute Convert cNGN -> Naira Balance
const btnExecuteSellCngn = document.getElementById('btnExecuteSellCngn');
if (btnExecuteSellCngn) {
  btnExecuteSellCngn.addEventListener('click', async () => {
    if (!userWalletAddress) {
      showHubStatus('Please connect your wallet or log in first.', 'error');
      return;
    }
    const amt = parseFloat(document.getElementById('buysellSellAmount')?.value.replace(/[^0-9.]/g, '')) || 0;
    if (amt <= 0) {
      showHubStatus('Please enter a valid amount of cNGN to convert.', 'error');
      return;
    }
    if (amt > userCngnBalance) {
      showHubStatus(`Insufficient cNGN! Your balance is ₦${userCngnBalance.toLocaleString('en-NG')} cNGN.`, 'error');
      return;
    }

    btnExecuteSellCngn.disabled = true;
    btnExecuteSellCngn.innerText = 'Converting cNGN to Naira...';
    showHubStatus('⏳ Converting cNGN back into your in-app Naira balance...', 'info');

    try {
      const res = await fetch('/api/account/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: userWalletAddress,
          fromCurrency: 'cNGN',
          toCurrency: 'NGN',
          amount: amt
        })
      });
      const data = await res.json();
      if (data.success) {
        userNairaBalance = (typeof data.nairaBalance === 'number') ? data.nairaBalance : (userNairaBalance + amt);
        lastDepositLockTimestamp = 0;
        lastDepositLockedAmount = userNairaBalance;
        userCngnBalance = Math.max(0, userCngnBalance - amt);
        showHubStatus(`
          <div style="font-weight:800;color:var(--kobo-green);margin-bottom:4px;">🎉 Converted to Naira!</div>
          <div>₦${amt.toLocaleString('en-NG')} cNGN converted into your in-app Naira balance.</div>
        `, 'success');
        updateBalancesInUI();
      } else {
        showHubStatus(`Conversion failed: ${data.message}`, 'error');
      }
    } catch (err) {
      showHubStatus(`Conversion network error: ${err.message}`, 'error');
    } finally {
      btnExecuteSellCngn.disabled = false;
      btnExecuteSellCngn.innerText = '🔄 Convert cNGN to Naira Balance';
      updateBalancesInUI();
    }
  });
}

// ----------------------------------------------------
// TAB 3: SEND ASSETS (ETH, cNGN, OR MEMECOINS)
// ----------------------------------------------------
window.updateSendAssetUI = function() {
  const selected = document.querySelector('input[name="sendAsset"]:checked')?.value || 'eth';
  const tokenPicker = document.getElementById('sendTokenPickerRow');
  const unitLabel = document.getElementById('sendAmountUnit');
  const ethBalSpan = document.getElementById('sendEthBal');
  const cngnBalSpan = document.getElementById('sendCngnBal');

  if (ethBalSpan) ethBalSpan.innerText = userEthBalance.toFixed(4);
  if (cngnBalSpan) cngnBalSpan.innerText = Math.floor(userCngnBalance).toLocaleString('en-NG');

  // Highlight selected card
  ['eth', 'cngn', 'token'].forEach(k => {
    const card = document.getElementById(`sendAsset${k.charAt(0).toUpperCase() + k.slice(1)}Label`);
    if (card) {
      if (k === selected) {
        card.style.borderColor = 'var(--kobo-green)';
        card.style.background = 'rgba(0, 255, 135, 0.08)';
      } else {
        card.style.borderColor = 'transparent';
        card.style.background = 'rgba(0, 0, 0, 0.4)';
      }
    }
  });

  if (selected === 'eth') {
    if (tokenPicker) tokenPicker.style.display = 'none';
    if (unitLabel) unitLabel.innerText = 'ETH';
  } else if (selected === 'cngn') {
    if (tokenPicker) tokenPicker.style.display = 'none';
    if (unitLabel) unitLabel.innerText = 'cNGN';
  } else {
    if (tokenPicker) tokenPicker.style.display = 'block';
    const select = document.getElementById('sendTokenSelect');
    const selectedOpt = select?.options[select.selectedIndex];
    const sym = selectedOpt?.getAttribute('data-symbol') || 'TOKEN';
    if (unitLabel) unitLabel.innerText = '$' + sym;
  }
};

window.setSendMax = function() {
  const selected = document.querySelector('input[name="sendAsset"]:checked')?.value || 'eth';
  const amountInput = document.getElementById('sendAmount');
  if (!amountInput) return;

  if (selected === 'eth') {
    // Keep 0.00015 ETH for gas
    const maxEth = Math.max(0, userEthBalance - 0.00015);
    amountInput.value = maxEth > 0 ? maxEth.toFixed(4) : '0';
  } else if (selected === 'cngn') {
    amountInput.value = Math.floor(userCngnBalance);
  } else {
    const select = document.getElementById('sendTokenSelect');
    const bal = parseFloat(select?.options[select.selectedIndex]?.getAttribute('data-balance')) || 0;
    amountInput.value = Math.floor(bal);
  }
};

window.populateSendTokensDropdown = async function() {
  const select = document.getElementById('sendTokenSelect');
  if (!select) return;

  if (!userWalletAddress) {
    select.innerHTML = '<option value="">Please connect wallet first</option>';
    return;
  }

  try {
    const res = await fetch(`/api/user-portfolio?address=${userWalletAddress}`);
    const data = await res.json();
    const portfolio = (data.success && Array.isArray(data.portfolio)) ? data.portfolio : [];

    if (portfolio.length === 0) {
      select.innerHTML = '<option value="">No memecoin tokens found in wallet</option>';
      const tokBal = document.getElementById('sendTokenBal');
      if (tokBal) tokBal.innerText = '0';
      return;
    }

    select.innerHTML = portfolio.map(p => `
      <option value="${p.address}" data-symbol="${p.symbol}" data-balance="${p.tokenCount}">
        $${p.symbol} - ${p.name} (${Math.round(p.tokenCount).toLocaleString('en-NG')} held)
      </option>
    `).join('');

    const updateSelBal = () => {
      const opt = select.options[select.selectedIndex];
      const bal = parseFloat(opt?.getAttribute('data-balance')) || 0;
      const tokBal = document.getElementById('sendTokenBal');
      if (tokBal) tokBal.innerText = Math.round(bal).toLocaleString('en-NG');
      const unit = document.getElementById('sendAmountUnit');
      if (unit) unit.innerText = '$' + (opt?.getAttribute('data-symbol') || 'TOKEN');
    };

    select.onchange = updateSelBal;
    updateSelBal();
  } catch (e) {
    console.warn('Error loading send tokens dropdown:', e);
  }
};

// Send Asset Submit Handler
const btnExecuteSend = document.getElementById('btnExecuteSend');
if (btnExecuteSend) {
  btnExecuteSend.addEventListener('click', async () => {
    const selected = document.querySelector('input[name="sendAsset"]:checked')?.value || 'eth';
    const toAddress = document.getElementById('sendToAddress')?.value.trim();
    const amountStr = document.getElementById('sendAmount')?.value.trim();
    const amount = parseFloat(amountStr) || 0;
    const statusBox = document.getElementById('sendStatusBox');

    const showSendStatus = (msg, type = 'info') => {
      if (!statusBox) return;
      statusBox.style.display = 'block';
      statusBox.innerHTML = msg;
      if (type === 'success') {
        statusBox.style.background = 'rgba(0, 255, 135, 0.12)';
        statusBox.style.border = '1px solid rgba(0, 255, 135, 0.35)';
        statusBox.style.color = '#00FF87';
      } else if (type === 'error') {
        statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        statusBox.style.color = '#F87171';
      } else {
        statusBox.style.background = 'rgba(99, 102, 241, 0.15)';
        statusBox.style.border = '1px solid rgba(99, 102, 241, 0.35)';
        statusBox.style.color = '#C7D2FE';
      }
    };

    if (!toAddress || !ethers.isAddress(toAddress)) {
      showSendStatus('Please enter a valid recipient address (0x...)', 'error');
      return;
    }

    if (amount <= 0) {
      showSendStatus('Please enter an amount greater than 0', 'error');
      return;
    }

    btnExecuteSend.disabled = true;
    btnExecuteSend.innerText = 'Connecting Wallet...';
    showSendStatus('Connecting wallet signer on Base Sepolia...', 'info');

    try {
      const signer = await getUserSigner();
      if (!signer) {
        showSendStatus('Please connect your wallet first.', 'error');
        if (window.openDynamicModal) window.openDynamicModal();
        btnExecuteSend.disabled = false;
        btnExecuteSend.innerText = '📤 Send Asset (On-Chain)';
        return;
      }

      showSendStatus('Confirm transaction in your wallet...', 'info');
      btnExecuteSend.innerText = 'Confirm in Wallet...';

      let tx = null;
      let assetName = 'ETH';

      if (selected === 'eth') {
        assetName = 'ETH';
        tx = await signer.sendTransaction({
          to: toAddress,
          value: ethers.parseEther(amount.toString())
        });
      } else if (selected === 'cngn') {
        assetName = 'cNGN';
        const cngnAddr = appConfig?.cngnAddress || '0xDdc8B9e1Afdcc3136212c8642d253285c2Bc237c';
        const cngnContract = new ethers.Contract(cngnAddr, CNGN_ABI, signer);
        const units = ethers.parseUnits(amount.toString(), 6);
        tx = await cngnContract.transfer(toAddress, units);
      } else {
        const select = document.getElementById('sendTokenSelect');
        const tokenAddr = select?.value;
        const sym = select?.options[select.selectedIndex]?.getAttribute('data-symbol') || 'TOKEN';
        assetName = '$' + sym;
        if (!tokenAddr || !ethers.isAddress(tokenAddr)) {
          showSendStatus('Please select a valid token.', 'error');
          btnExecuteSend.disabled = false;
          btnExecuteSend.innerText = '📤 Send Asset (On-Chain)';
          return;
        }
        const tokContract = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
        const units = ethers.parseUnits(amount.toString(), 18);
        tx = await tokContract.transfer(toAddress, units);
      }

      showSendStatus(`⚡ Transaction submitted (${shortenAddress(tx.hash)})! Waiting for block confirmation...`, 'info');
      btnExecuteSend.innerText = 'Confirming on Base...';

      const receipt = await tx.wait();
      confetti({ particleCount: 90, spread: 70, colors: ['#00FF87', '#3B82F6', '#FFF'] });

      showSendStatus(`
        <div style="font-weight: 800; font-size: 13px; margin-bottom: 4px;">🎉 Transfer Confirmed!</div>
        <div>Successfully sent ${amount.toLocaleString('en-NG')} ${assetName} to ${shortenAddress(toAddress)}.</div>
        <a href="https://sepolia.basescan.org/tx/${receipt.hash}" target="_blank" style="color: var(--kobo-green); text-decoration: underline; font-weight: 700; font-size: 11px; margin-top: 4px; display: inline-block;">
          View on Basescan ↗
        </a>
      `, 'success');

      document.getElementById('sendAmount').value = '';
      refreshAllData();
      populateSendTokensDropdown();
    } catch (err) {
      console.error('Send error:', err);
      const friendly = parseTradeError(err);
      showSendStatus(`❌ Transfer failed: ${friendly}`, 'error');
    } finally {
      btnExecuteSend.disabled = false;
      btnExecuteSend.innerText = '📤 Send Asset (On-Chain)';
    }
  });
}

// ----------------------------------------------------
// TAB 3: CASH OUT / WITHDRAW (cNGN ➔ NIGERIAN BANK)
// ----------------------------------------------------
const btnMaxWithdraw = document.getElementById('btnMaxWithdraw');
if (btnMaxWithdraw) {
  btnMaxWithdraw.addEventListener('click', () => {
    const input = document.getElementById('hubWithdrawAmount');
    if (input) {
      const maxVal = Math.floor(userCngnBalance);
      input.value = maxVal > 0 ? maxVal.toLocaleString('en-NG') : '0';
    }
  });
}

const hubWithdrawAmountInput = document.getElementById('hubWithdrawAmount');
if (hubWithdrawAmountInput) {
  hubWithdrawAmountInput.addEventListener('input', (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw === '') {
      e.target.value = '';
    } else {
      const num = parseInt(raw, 10);
      e.target.value = num.toLocaleString('en-NG');
    }
  });
}

const btnExecuteWithdraw = document.getElementById('btnExecuteWithdraw');
if (btnExecuteWithdraw) {
  btnExecuteWithdraw.addEventListener('click', async () => {
    const bankSelect = document.getElementById('hubWithdrawBank');
    const accNumInput = document.getElementById('hubWithdrawAccNumber');
    const accNameInput = document.getElementById('hubWithdrawAccName');
    const amtInput = document.getElementById('hubWithdrawAmount');

    const bankName = bankSelect?.value || 'Bank';
    const accountNumber = accNumInput?.value.trim() || '';
    const accountName = accNameInput?.value.trim() || '';
    const amount = parseFloat(amtInput?.value.replace(/[^0-9.]/g, '')) || 0;

    if (!accountNumber || accountNumber.length < 10) {
      showHubStatus('Please enter a valid 10-digit Nigerian bank account number.', 'error');
      return;
    }

    if (amount <= 0) {
      showHubStatus('Please enter a valid withdrawal amount.', 'error');
      return;
    }

    if (amount > userCngnBalance) {
      showHubStatus(`Insufficient cNGN! Your balance is ₦${userCngnBalance.toLocaleString()} cNGN.`, 'error');
      return;
    }

    btnExecuteWithdraw.disabled = true;
    btnExecuteWithdraw.innerText = 'Processing Payout...';
    showHubStatus(`Submitting withdrawal of ₦${amount.toLocaleString()} to ${bankName}...`, 'info');

    try {
      const res = await fetch('/api/account/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: userWalletAddress,
          amountCngn: amount,
          bankName,
          accountNumber,
          accountName
        })
      });
      const data = await res.json();

      if (data.success) {
        userCngnBalance = Math.max(0, userCngnBalance - amount);
        confetti({ particleCount: 100, spread: 70, colors: ['#00FF87', '#F59E0B', '#FFF'] });
        showHubStatus(`
          <div style="font-weight: 800; font-size: 14px; color: var(--kobo-green); margin-bottom: 4px;">💸 Cash Out Initiated!</div>
          <div>${data.message}</div>
          <div style="font-size: 11px; margin-top: 6px; color: #E2E8F0;">
            <b>Beneficiary:</b> ${data.accountName} • ${data.accountNumber} (${data.bankName})<br>
            <b>Paystack Ref:</b> <span style="font-family: monospace;">${data.reference}</span>
          </div>
        `, 'success');
        updateBalancesInUI();
      } else {
        showHubStatus(data.message || 'Withdrawal failed.', 'error');
      }
    } catch (e) {
      showHubStatus('Withdrawal error: ' + e.message, 'error');
    } finally {
      btnExecuteWithdraw.disabled = false;
      btnExecuteWithdraw.innerText = '📤 Cash Out to Bank Account';
    }
  });
}

// ----------------------------------------------------
// TAB 4: GAS STATION (BASE SEPOLIA ETH)
// ----------------------------------------------------
const btnHubCopyGasAddr = document.getElementById('btnHubCopyGasAddress');
if (btnHubCopyGasAddr) {
  btnHubCopyGasAddr.addEventListener('click', () => {
    if (!userWalletAddress) return;
    navigator.clipboard.writeText(userWalletAddress);
    btnHubCopyGasAddr.innerText = '✓ Copied!';
    setTimeout(() => { btnHubCopyGasAddr.innerText = '📋 Copy'; }, 2000);
  });
}

const btnHubRefreshGas = document.getElementById('btnHubRefreshGas');
if (btnHubRefreshGas) {
  btnHubRefreshGas.addEventListener('click', async () => {
    btnHubRefreshGas.innerText = 'Checking...';
    if (userWalletAddress) {
      try {
        const res = await fetch(`/api/eth-balance?address=${userWalletAddress}`);
        const data = await res.json();
        if (data.success && typeof data.balanceEth === 'number') {
          userEthBalance = data.balanceEth;
          updateBalancesInUI();
          if (userEthBalance >= 0.0005) {
            confetti({ particleCount: 60, spread: 50, colors: ['#93C5FD', '#3B82F6', '#FFF'] });
            showHubStatus(`✅ Gas confirmed: ${userEthBalance.toFixed(4)} ETH available! You are ready to trade.`, 'success');
          } else {
            showHubStatus(`Balance: ${userEthBalance.toFixed(5)} ETH. If you just claimed from a faucet, please allow ~15 seconds for Base Sepolia to confirm.`, 'info');
          }
        }
      } catch (e) {
        console.warn('ETH check error:', e);
      }
    }
    btnHubRefreshGas.innerText = '🔄 Refresh';
  });
}

// ----------------------------------------------------
// TAB 5: MY MEMECOIN PORTFOLIO
// ----------------------------------------------------
async function loadUserPortfolio() {
  const container = document.getElementById('hubPortfolioList');
  if (!container) return;

  if (!userWalletAddress) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">
        Please connect your wallet to view your memecoin holdings.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="text-align: center; padding: 24px; color: #94A3B8; font-size: 13px;">
      Scanning Base Sepolia for your cultural memecoins...
    </div>
  `;

  try {
    const res = await fetch(`/api/user-portfolio?address=${userWalletAddress}`);
    const data = await res.json();

    if (data.success && Array.isArray(data.portfolio)) {
      userPortfolioData = data.portfolio;

      if (userPortfolioData.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 32px 20px; background: rgba(255, 255, 255, 0.02); border-radius: 14px; border: 1px dashed var(--border-subtle);">
            <div style="font-size: 32px; margin-bottom: 8px;">🎒</div>
            <div style="font-size: 14px; font-weight: 700; color: #FFF; margin-bottom: 4px;">Your Bag is Currently Empty</div>
            <p style="font-size: 12px; color: var(--text-secondary); max-width: 340px; margin: 0 auto 16px auto;">
              You do not hold any cultural memecoins yet. Pack an Odogwu coin on the launchpad to get started!
            </p>
            <button type="button" class="btn-kobo" onclick="document.getElementById('accountHubModal').classList.remove('active')" style="padding: 8px 18px; font-size: 12px;">
              🔥 Explore Odogwu Coins
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = userPortfolioData.map(item => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-subtle); border-radius: 12px; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${resolveIpfsUrl(item.imageUri)}" alt="${item.name}" style="width: 40px; height: 40px; border-radius: 10px; object-fit: cover; border: 1px solid rgba(255,255,255,0.15);">
            <div>
              <div style="font-size: 13px; font-weight: 800; color: #FFF; display: flex; align-items: center; gap: 6px;">
                <span>${item.name}</span>
                <span style="font-size: 10px; color: var(--cowrie-gold-light); font-weight: 700;">$${item.symbol}</span>
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                ${Math.round(item.tokenCount).toLocaleString()} tokens held
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="text-align: right;">
              <div style="font-size: 13px; font-weight: 800; color: var(--kobo-green);">
                ₦${item.valueNaira.toLocaleString('en-NG', { maximumFractionDigits: 2 })}
              </div>
              <div style="font-size: 10px; color: #94A3B8;">
                Est. Value
              </div>
            </div>
            <button type="button" class="btn-secondary" onclick="document.getElementById('accountHubModal').classList.remove('active'); window.openTradeModal('${item.address}');" style="padding: 7px 12px; font-size: 11px; border-color: rgba(0, 255, 135, 0.3); color: var(--kobo-green);">
              Trade ↗
            </button>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #FCA5A5; font-size: 12px;">
        Failed to load portfolio: ${err.message}
      </div>
    `;
  }
}

const btnHubRefreshPortfolio = document.getElementById('btnHubRefreshPortfolio');
if (btnHubRefreshPortfolio) {
  btnHubRefreshPortfolio.addEventListener('click', loadUserPortfolio);
}

// Status Box Helper for Token Creation
function showCreateCoinStatus(html, type = 'info') {
  const box = document.getElementById('createCoinStatusBox');
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = html;
  if (type === 'success') {
    box.style.background = 'rgba(0, 255, 135, 0.12)';
    box.style.border = '1px solid rgba(0, 255, 135, 0.35)';
    box.style.color = '#00FF87';
  } else if (type === 'error') {
    box.style.background = 'rgba(239, 68, 68, 0.15)';
    box.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    box.style.color = '#F87171';
  } else {
    box.style.background = 'rgba(99, 102, 241, 0.15)';
    box.style.border = '1px solid rgba(99, 102, 241, 0.35)';
    box.style.color = '#C7D2FE';
  }
}

// Create Coin Modal Triggers
document.getElementById('btnOpenCreate').addEventListener('click', async () => {
  const modal = document.getElementById('createCoinModal');
  modal.classList.add('active');

  const accDisplay = document.getElementById('createCoinAccountDisplay');
  const gasBadge = document.getElementById('createCoinGasBadge');
  const statusBox = document.getElementById('createCoinStatusBox');
  if (statusBox) statusBox.style.display = 'none';

  if (accDisplay) {
    accDisplay.innerText = userWalletAddress ? shortenAddress(userWalletAddress) : 'Connect wallet';
    accDisplay.style.color = userWalletAddress ? 'var(--kobo-green)' : '#F59E0B';
  }
  if (gasBadge) {
    gasBadge.innerText = (userEthBalance ? userEthBalance.toFixed(4) : '0.0000') + ' ETH';
  }

  if (userWalletAddress) {
    try {
      const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
      const bal = await provider.getBalance(userWalletAddress);
      userEthBalance = Number(ethers.formatEther(bal));
      if (gasBadge) gasBadge.innerText = userEthBalance.toFixed(4) + ' ETH';
    } catch (e) {}
  }
});

// Category Tag Selector on Create Modal
let selectedCultureTag = 'Meme';
document.querySelectorAll('.culture-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.culture-btn').forEach(b => {
      b.style.background = 'var(--bg-elevated)';
      b.style.color = 'var(--text-secondary)';
    });
    btn.style.background = 'var(--kobo-green)';
    btn.style.color = '#041008';
    selectedCultureTag = btn.getAttribute('data-tag');
  });
});

// ==========================================
// IPFS DECENTRALIZED IMAGE UPLOAD CONTROLLER
// ==========================================
const ipfsDropzone = document.getElementById('ipfsDropzone');
const coinImageFileInput = document.getElementById('coinImageFileInput');
const ipfsIdleState = document.getElementById('ipfsIdleState');
const ipfsLoadingState = document.getElementById('ipfsLoadingState');
const ipfsPreviewState = document.getElementById('ipfsPreviewState');
const ipfsThumbnail = document.getElementById('ipfsThumbnail');
const ipfsFileName = document.getElementById('ipfsFileName');
const ipfsCidBadge = document.getElementById('ipfsCidBadge');
const ipfsCidShort = document.getElementById('ipfsCidShort');
const ipfsFileSize = document.getElementById('ipfsFileSize');
const newCoinImageUrl = document.getElementById('newCoinImageUrl');
const btnReplaceIpfs = document.getElementById('btnReplaceIpfsImage');

function showIpfsState(state) {
  if (ipfsIdleState) ipfsIdleState.style.display = state === 'idle' ? 'block' : 'none';
  if (ipfsLoadingState) ipfsLoadingState.style.display = state === 'loading' ? 'block' : 'none';
  if (ipfsPreviewState) ipfsPreviewState.style.display = state === 'preview' ? 'block' : 'none';
}

// Client-Side Image Optimizer (Scales to 512x512 max, compresses to clean WebP/JPEG, fits safely in Firestore & Vercel)
function optimizeImageForAvatar(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    // Keep raw vector SVG or animated GIF
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 512;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      try {
        const dataUrl = canvas.toDataURL('image/webp', 0.9);
        if (dataUrl && dataUrl.startsWith('data:image/webp')) {
          return resolve(dataUrl);
        }
      } catch (e) {}
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    img.src = url;
  });
}

async function handleIpfsFileUpload(file) {
  if (!file) return;

  const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!validTypes.includes(file.type)) {
    alert('Please select a valid image file (PNG, JPG, GIF, WebP, SVG).');
    return;
  }

  showIpfsState('loading');

  try {
    const fileData = await optimizeImageForAvatar(file);
    if (!fileData) throw new Error('Could not process image file');

    const res = await fetch('/api/ipfs/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileData: fileData,
        fileName: file.name
      })
    });

    const data = await res.json();
    if (data.success && data.cid) {
      const ipfsUri = data.ipfsUri || `ipfs://${data.cid}`;
      if (newCoinImageUrl) newCoinImageUrl.value = ipfsUri;

      if (ipfsThumbnail) {
        ipfsThumbnail.src = data.gatewayUrl || `/ipfs/${data.cid}`;
        ipfsThumbnail.onerror = () => {
          ipfsThumbnail.onerror = null;
          ipfsThumbnail.src = fileData;
        };
      }
      if (ipfsFileName) ipfsFileName.innerText = file.name;
      if (ipfsCidShort) ipfsCidShort.innerText = shortenAddress(data.cid);
      const approxKb = Math.round((fileData.length * 3) / 4 / 1024);
      if (ipfsFileSize) ipfsFileSize.innerText = `${approxKb > 0 ? approxKb : 1} KB • Content-Addressed`;

      // Clear preset active states
      document.querySelectorAll('.preset-img').forEach(b => {
        b.style.background = 'var(--bg-elevated)';
        b.style.borderColor = 'var(--border-subtle)';
        b.classList.remove('active');
      });

      showIpfsState('preview');
      console.log('✅ Image uploaded to IPFS:', ipfsUri);
    } else {
      alert(data.message || 'IPFS upload failed.');
      showIpfsState('idle');
    }
  } catch (uploadErr) {
    console.error('IPFS upload network error:', uploadErr);
    alert('Network error while uploading to IPFS: ' + uploadErr.message);
    showIpfsState('idle');
  }
}

// Click dropzone to open native file browser
if (ipfsDropzone) {
  ipfsDropzone.addEventListener('click', (e) => {
    if (e.target === btnReplaceIpfs || btnReplaceIpfs?.contains(e.target)) {
      if (coinImageFileInput) coinImageFileInput.click();
      return;
    }
    if (ipfsPreviewState?.style.display === 'block') {
      return;
    }
    if (coinImageFileInput) coinImageFileInput.click();
  });

  ['dragenter', 'dragover'].forEach(evtName => {
    ipfsDropzone.addEventListener(evtName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      ipfsDropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(evtName => {
    ipfsDropzone.addEventListener(evtName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      ipfsDropzone.classList.remove('dragover');
    });
  });

  ipfsDropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      handleIpfsFileUpload(files[0]);
    }
  });
}

if (coinImageFileInput) {
  coinImageFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleIpfsFileUpload(e.target.files[0]);
    }
  });
}

if (btnReplaceIpfs) {
  btnReplaceIpfs.addEventListener('click', (e) => {
    e.stopPropagation();
    if (coinImageFileInput) coinImageFileInput.click();
  });
}

if (ipfsCidBadge) {
  ipfsCidBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    if (newCoinImageUrl && newCoinImageUrl.value) {
      navigator.clipboard.writeText(newCoinImageUrl.value);
      const origHtml = ipfsCidBadge.innerHTML;
      ipfsCidBadge.innerHTML = '<span>✓ Copied IPFS URI</span>';
      setTimeout(() => { ipfsCidBadge.innerHTML = origHtml; }, 2000);
    }
  });
}

// Preset Image Selectors
document.querySelectorAll('.preset-img').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-img').forEach(b => {
      b.style.background = 'var(--bg-elevated)';
      b.style.borderColor = 'var(--border-subtle)';
      b.classList.remove('active');
    });
    btn.style.background = 'rgba(0, 255, 135, 0.2)';
    btn.style.borderColor = 'var(--kobo-green)';
    btn.classList.add('active');

    const uri = btn.getAttribute('data-url');
    const name = btn.getAttribute('data-name') || 'Preset Token';
    if (newCoinImageUrl && uri) {
      newCoinImageUrl.value = uri;
      if (ipfsThumbnail) ipfsThumbnail.src = resolveIpfsUrl(uri);
      if (ipfsFileName) ipfsFileName.innerText = name + ' (Preset Avatar)';
      const cid = uri.replace('ipfs://', '');
      if (ipfsCidShort) ipfsCidShort.innerText = shortenAddress(cid);
      if (ipfsFileSize) ipfsFileSize.innerText = 'IPFS Native Preset';
      showIpfsState('preview');
    }
  });
});


// Create Coin Form Submit (100% On-Chain, User Wallet Signed)
document.getElementById('createCoinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('newCoinName').value.trim();
  const symbol = document.getElementById('newCoinSymbol').value.trim().toUpperCase();
  const desc = document.getElementById('newCoinDesc').value.trim();
  const img = document.getElementById('newCoinImageUrl').value.trim();

  if (!name || !symbol) {
    showCreateCoinStatus('Please enter both token name and symbol.', 'error');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitNewCoin');
  submitBtn.disabled = true;

  try {
    // 1. Resolve User Signer
    showCreateCoinStatus('Connecting to your logged-in wallet on Base Sepolia...', 'info');
    const signer = await getUserSigner();
    if (!signer) {
      showCreateCoinStatus('Wallet not connected! Please connect your wallet first.', 'error');
      if (window.openDynamicModal) window.openDynamicModal();
      submitBtn.disabled = false;
      return;
    }

    const activeAddress = await signer.getAddress();
    userWalletAddress = activeAddress;
    console.log('⚡ [Create Token] Active Deployer Signer:', activeAddress);

    const accDisplay = document.getElementById('createCoinAccountDisplay');
    if (accDisplay) accDisplay.innerText = shortenAddress(activeAddress);

    // 2. Check Gas (Base Sepolia ETH)
    showCreateCoinStatus('Verifying Base Sepolia ETH for contract deployment gas...', 'info');
    const hasGas = await checkGasSufficient(activeAddress);
    if (!hasGas) {
      showCreateCoinStatus(`
        <div style="font-weight: 800; font-size: 13px; margin-bottom: 4px; color: #FCA5A5;">⚠️ Insufficient Base Sepolia ETH for Gas!</div>
        <div style="margin-bottom: 8px; color: #E2E8F0; line-height: 1.4;">
          Deploying an ERC-20 contract and bonding curve requires ~0.0003 ETH. Please get free testnet ETH from our Gas Station.
        </div>
        <button type="button" onclick="openAccountHub('tab-gas')" class="btn-kobo" style="background: linear-gradient(135deg, #3B82F6, #1D4ED8); padding: 8px 16px; font-size: 12px; font-weight: 700;">
          ⛽ Open Gas Station (Account Hub)
        </button>
      `, 'error');
      submitBtn.disabled = false;
      return;
    }

    const curveAddress = appConfig?.bondingCurveAddress || '0x50300237A5c8AFb7d7D56F8c08FBaa22EB92E203';
    const factory = new ethers.Contract(curveAddress, KOBO_CURVE_ABI, signer);

    showCreateCoinStatus('⏳ Please confirm the token deployment transaction in your wallet...', 'info');
    submitBtn.innerText = 'Confirming in Wallet...';

    const tx = await factory.createToken(
      name,
      symbol,
      img || 'ipfs://QmaY3VHxZuDwX98SpnmUiA1i6eyAMymeQ1nCPzDpPCn4jY',
      desc || '',
      { gasLimit: 2500000 }
    );

    showCreateCoinStatus(`⚡ Transaction broadcasted (${shortenAddress(tx.hash)})! Waiting for block confirmation on Base Sepolia...`, 'info');
    submitBtn.innerText = 'Mining on Base Sepolia...';

    const receipt = await tx.wait();
    console.log('✅ Token deployment confirmed on Base Sepolia:', receipt);

    // 3. Extract deployed token address
    let tokenAddress = null;
    const iface = new ethers.Interface(KOBO_CURVE_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'TokenCreated') {
          tokenAddress = parsed.args.tokenAddress || parsed.args[0];
          break;
        }
      } catch (logErr) {}
    }

    if (!tokenAddress) {
      const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
      const factoryRead = new ethers.Contract(curveAddress, KOBO_CURVE_ABI, provider);
      const totalLen = await factoryRead.allTokensLength();
      tokenAddress = await factoryRead.allTokens(totalLen - 1n);
    }

    console.log(`🎉 New Token Address: ${tokenAddress}`);

    // 4. Register on Backend
    const regRes = await fetch('/api/tokens/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: tokenAddress,
        name,
        symbol,
        description: desc,
        imageUri: img,
        cultureTag: selectedCultureTag,
        creator: activeAddress,
        txHash: receipt.hash
      })
    });
    const regData = await regRes.json();

    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 }, colors: ['#00FF87', '#F59E0B', '#FFF'] });

    showCreateCoinStatus(`
      <div style="font-size: 14px; font-weight: 800; color: var(--kobo-green); margin-bottom: 4px;">🎉 Token Successfully Deployed On-Chain!</div>
      <div style="margin-bottom: 4px; color: #FFF;">Token <b>$${symbol}</b> deployed at <span style="font-family: monospace; color: var(--cowrie-gold-light);">${shortenAddress(tokenAddress)}</span></div>
      <div style="font-size: 11px; color: #94A3B8; margin-bottom: 8px;">You are the verified on-chain creator and earn 0.35% royalty on all trading volume!</div>
      <a href="https://sepolia.basescan.org/tx/${receipt.hash}" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; color: var(--kobo-green); text-decoration: underline; font-weight: 700;">
        <span>View on Basescan Explorer</span> ↗
      </a>
    `, 'success');

    if (regData.success && regData.token) {
      allTokens.unshift(regData.token);
    } else {
      allTokens.unshift({
        address: tokenAddress,
        name,
        symbol,
        description: desc,
        imageUri: img,
        creator: activeAddress,
        marketCapNaira: 2500000,
        priceKobo: 0.0025,
        progressPercent: 0,
        totalTrades: 0,
        cultureTag: selectedCultureTag,
        graduated: false
      });
    }

    renderOdogwu();
    renderTokens();

    setTimeout(() => {
      document.getElementById('createCoinModal').classList.remove('active');
    }, 4000);

  } catch (err) {
    console.error('On-chain token creation error:', err);
    let msg = err.reason || err.message || 'Transaction failed or was rejected.';
    if (msg.includes('user rejected') || msg.includes('ACTION_REJECTED')) {
      msg = 'Transaction was rejected in your wallet.';
    } else if (msg.includes('insufficient funds')) {
      msg = 'Insufficient Base Sepolia ETH for gas. Please claim testnet ETH from our Gas Station.';
    }
    showCreateCoinStatus(`❌ Deployment Error: ${msg}`, 'error');
  } finally {
    submitBtn.innerText = '🚀 Deploy Token (Fair Launch)';
    submitBtn.disabled = false;
  }
});

// Close modals
document.querySelectorAll('.close-modal').forEach(btn => {
  btn.addEventListener('click', () => {
    const modalId = btn.getAttribute('data-modal');
    document.getElementById(modalId).classList.remove('active');
  });
});

window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// Helper to get or generate persistent session wallet for social users (Google/X)
function getOrCreateSocialSessionWallet(user) {
  if (!user) return null;
  const userKey = user.userId || user.id || user.email || 'anon_social';
  const storageKey = 'kobo_wallet_' + userKey;
  let stored = localStorage.getItem(storageKey);
  if (!stored) {
    try {
      if (window.ethers && ethers.Wallet) {
        const w = ethers.Wallet.createRandom();
        stored = w.address;
        localStorage.setItem(storageKey, stored);
      }
    } catch (e) {
      console.warn('Wallet creation fallback notice:', e);
    }
  }
  return stored;
}

// --- Dynamic Auth Hooks & Wallet State Synchronization ---

// Show a toast notification after successful login
function showLoginToast(name, address) {
  const existing = document.getElementById('koboLoginToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'koboLoginToast';
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: linear-gradient(135deg, rgba(10,15,29,0.98), rgba(16,21,32,0.98));
    border: 1px solid rgba(0, 255, 135, 0.4);
    border-radius: 16px; padding: 14px 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(0,255,135,0.15);
    display: flex; align-items: center; gap: 14px;
    max-width: 340px; animation: slideInToast 0.35s ease;
    font-family: 'Outfit', sans-serif;
  `;
  toast.innerHTML = `
    <style>
      @keyframes slideInToast {
        from { transform: translateX(120%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
      @keyframes slideOutToast {
        from { transform: translateX(0);    opacity: 1; }
        to   { transform: translateX(120%); opacity: 0; }
      }
    </style>
    <div style="width:38px;height:38px;border-radius:10px;background:rgba(0,255,135,0.15);border:1px solid rgba(0,255,135,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">✅</div>
    <div>
      <div style="font-size:13px;font-weight:800;color:#FFF;margin-bottom:2px;">Logged in${name ? ' as ' + name : ''}!</div>
      <div style="font-size:11px;color:#94A3B8;font-family:monospace;">${shortenAddress(address)}</div>
    </div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#475569;font-size:18px;cursor:pointer;margin-left:auto;padding:0 4px;line-height:1;">✕</button>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOutToast 0.3s ease forwards';
    setTimeout(() => toast.remove(), 320);
  }, 4000);
}

// Called when user logs in with Google, Email OTP, or any social provider
window.onDynamicSocialLoggedIn = async (user) => {
  console.log('👤 [Dynamic Auth] Social login success:', user?.email || user?.id);
  window.dynamicUser = user;

  // Prefill deposit email
  const email = user?.email || user?.verifiedCredentials?.find(c => c.email)?.email;
  if (email) {
    const depositEmail = document.getElementById('hubDepositEmail');
    if (depositEmail) depositEmail.value = email;
  }

  // Get the verified on-chain address from Dynamic (embedded wallet)
  const address = user?.verifiedCredentials?.find(c => c.address)?.address;
  if (address) {
    userWalletAddress = address;
    window.dynamicAddress = address;
    updateBalancesInUI();

    const displayName = user?.firstName || email || null;
    showLoginToast(displayName, address);

    try {
      const [cngnRes, ethRes] = await Promise.all([
        fetch(`/api/cngn-balance?address=${address}`).then(r => r.json()),
        fetch(`/api/eth-balance?address=${address}`).then(r => r.json())
      ]);
      if (cngnRes.success) { userCngnBalance = cngnRes.balance; }
      if (ethRes.success) { userEthBalance = ethRes.balanceEth; }
      updateBalancesInUI();
      checkGasAlertOnLogin(address, userEthBalance);
    } catch (err) {
      console.warn('Balance fetch notice:', err);
    }
  }
};

// Called when user connects any wallet (MetaMask via Dynamic, WalletConnect, etc.)
window.onDynamicWalletConnected = async (address, user) => {
  console.log('🔗 [Dynamic Auth] Wallet connected:', address);
  userWalletAddress = address;
  window.dynamicAddress = address;

  if (user) window.dynamicUser = user;

  const email = user?.email || user?.verifiedCredentials?.find(c => c.email)?.email;
  if (email) {
    const depositEmail = document.getElementById('hubDepositEmail');
    if (depositEmail) depositEmail.value = email;
  }

  updateBalancesInUI();
  showLoginToast(email || null, address);

  try {
    const [cngnRes, ethRes, nairaRes] = await Promise.all([
      fetch(`/api/cngn-balance?address=${address}`).then(r => r.json()),
      fetch(`/api/eth-balance?address=${address}`).then(r => r.json()),
      fetch(`/api/naira-balance?address=${address}`).then(r => r.json())
    ]);
    if (cngnRes.success) { userCngnBalance = cngnRes.balance; }
    if (ethRes.success) { userEthBalance = ethRes.balanceEth; }
    if (nairaRes.success && typeof nairaRes.balanceNaira === 'number') {
      if (Date.now() - lastDepositLockTimestamp < 30000 && nairaRes.balanceNaira < lastDepositLockedAmount) {
        userNairaBalance = lastDepositLockedAmount;
      } else {
        userNairaBalance = nairaRes.balanceNaira;
      }
    }
    updateBalancesInUI();
    checkGasAlertOnLogin(address, userEthBalance);
  } catch (err) {
    console.warn('Balance fetch notice:', err);
  }
};



window.onDynamicWalletDisconnected = () => {
  console.log('🔌 [Dynamic Auth] Wallet Disconnected');
  userWalletAddress = null;
  userNairaBalance = 0;
  userCngnBalance = 0;
  userEthBalance = 0;
  updateBalancesInUI();
};

// Unified Account Hub Navbar Trigger
const btnOpenAccountHub = document.getElementById('btnOpenAccountHub');
if (btnOpenAccountHub) {
  btnOpenAccountHub.addEventListener('click', () => {
    if (!userWalletAddress) {
      if (window.openDynamicModal) {
        window.openDynamicModal();
      }
    } else {
      window.openAccountHub('tab-deposit');
    }
  });
}

function updateBalancesInUI() {
  // 1. Sidebar Connect / Account Hub Trigger
  const hubNavDisc = document.getElementById('hubNavDisconnectedState');
  const hubNavConn = document.getElementById('hubNavConnectedState');
  const hubNavBal = document.getElementById('hubNavBalance');
  const hubNavAddr = document.getElementById('hubNavAddress');

  if (userWalletAddress) {
    if (hubNavDisc) hubNavDisc.style.display = 'none';
    if (hubNavConn) hubNavConn.style.display = 'flex';
    if (hubNavAddr) {
      hubNavAddr.innerText = shortenAddress(userWalletAddress);
      hubNavAddr.style.color = '#FFF';
    }
    if (hubNavBal) hubNavBal.innerText = formatNaira(userCngnBalance) + ' cNGN';
  } else {
    if (hubNavDisc) hubNavDisc.style.display = 'flex';
    if (hubNavConn) hubNavConn.style.display = 'none';
    if (hubNavAddr) {
      hubNavAddr.innerText = 'Connect';
      hubNavAddr.style.color = '#CBD5E1';
    }
    if (hubNavBal) hubNavBal.innerText = '₦0 cNGN';
  }

  // Mobile Top Bar Wallet Button & Mobile Drawer Account Action
  const mobileWalletLabel = document.getElementById('mobileWalletLabel');
  const mobileWalletDot = document.getElementById('mobileWalletDot');
  const btnMobileDrawerAccount = document.getElementById('btnMobileDrawerAccount');

  if (userWalletAddress) {
    if (mobileWalletLabel) mobileWalletLabel.innerText = formatNaira(userCngnBalance) + ' cNGN';
    if (mobileWalletDot) {
      mobileWalletDot.style.background = '#00FF87';
      mobileWalletDot.style.boxShadow = '0 0 6px #00FF87';
    }
    if (btnMobileDrawerAccount) {
      btnMobileDrawerAccount.innerText = '🎒 ' + shortenAddress(userWalletAddress) + ' • ' + formatNaira(userCngnBalance);
    }
  } else {
    if (mobileWalletLabel) mobileWalletLabel.innerText = 'Connect 👛';
    if (mobileWalletDot) {
      mobileWalletDot.style.background = 'var(--text-muted)';
      mobileWalletDot.style.boxShadow = 'none';
    }
    if (btnMobileDrawerAccount) {
      btnMobileDrawerAccount.innerText = '👛 Connect Wallet';
    }
  }

  // 2. Account Hub Modal Header
  const hubUserAddr = document.getElementById('hubUserAddress');
  if (hubUserAddr) {
    hubUserAddr.innerText = userWalletAddress ? shortenAddress(userWalletAddress) : 'Not Connected';
  }

  const hubBasescan = document.getElementById('hubBasescanLink');
  if (hubBasescan && userWalletAddress) {
    hubBasescan.href = `https://sepolia.basescan.org/address/${userWalletAddress}`;
  }

  // 3. Account Hub Modal Balances Snapshot
  const hubNairaDisplay = document.getElementById('hubNairaBalanceDisplay');
  if (hubNairaDisplay) hubNairaDisplay.innerText = formatNaira(userNairaBalance) + ' NGN';

  const buysellNairaAvail = document.getElementById('buysellNairaAvailable');
  if (buysellNairaAvail) buysellNairaAvail.innerText = Math.floor(userNairaBalance).toLocaleString('en-NG');

  const hubCngnDisplay = document.getElementById('hubCngnBalanceDisplay');
  if (hubCngnDisplay) hubCngnDisplay.innerText = formatNaira(userCngnBalance) + ' cNGN';

  const hubEthDisplay = document.getElementById('hubEthBalanceDisplay');
  if (hubEthDisplay) {
    hubEthDisplay.innerText = (userEthBalance ? userEthBalance.toFixed(4) : '0.0000') + ' ETH';
  }

  const hubGasStatus = document.getElementById('hubGasStatusText');
  if (hubGasStatus) {
    if (userEthBalance >= 0.0005) {
      hubGasStatus.innerText = '✅ Ready for transactions';
      hubGasStatus.style.color = '#86EFAC';
    } else {
      hubGasStatus.innerText = '⚠️ Low Gas - Claim testnet ETH';
      hubGasStatus.style.color = '#FCA5A5';
    }
  }

  // 4. Gas Tab Displays
  const gasCardBal = document.getElementById('hubGasCardBalance');
  if (gasCardBal) gasCardBal.innerText = (userEthBalance ? userEthBalance.toFixed(4) : '0.0000') + ' ETH';

  const gasStatusBadge = document.getElementById('hubGasStatusBadge');
  if (gasStatusBadge) {
    if (userEthBalance >= 0.0005) {
      gasStatusBadge.innerText = '✅ Sufficient gas for trades';
      gasStatusBadge.style.color = '#86EFAC';
    } else {
      gasStatusBadge.innerText = '⚠️ Low testnet ETH for gas';
      gasStatusBadge.style.color = '#FCA5A5';
    }
  }

  const gasAddrInput = document.getElementById('hubGasAddressInput');
  if (gasAddrInput) {
    gasAddrInput.value = userWalletAddress || 'Please connect wallet';
  }

  // 5. Withdrawal Tab Max Limit
  const maxWithdraw = document.getElementById('hubMaxWithdrawCngn');
  if (maxWithdraw) {
    maxWithdraw.innerText = '₦' + Math.floor(userCngnBalance).toLocaleString();
  }

  // 6. Deposit Tab Email Prefill
  if (window.dynamicUser && window.dynamicUser.email) {
    const depositEmail = document.getElementById('hubDepositEmail');
    if (depositEmail && (!depositEmail.value || depositEmail.value === 'trader@kobo.xyz')) {
      depositEmail.value = window.dynamicUser.email;
    }
  }

  // Update Wallet Type Badge
  const userTypeBadge = document.getElementById('hubUserTypeBadge');
  if (userTypeBadge) {
    if (!userWalletAddress) {
      userTypeBadge.innerText = 'DISCONNECTED';
      userTypeBadge.style.color = '#94A3B8';
      userTypeBadge.style.background = 'rgba(255, 255, 255, 0.06)';
      userTypeBadge.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    } else if (window.dynamicPrimaryWallet?.connector?.name) {
      userTypeBadge.innerText = window.dynamicPrimaryWallet.connector.name.toUpperCase();
      userTypeBadge.style.color = 'var(--kobo-green)';
      userTypeBadge.style.background = 'rgba(0, 255, 135, 0.15)';
      userTypeBadge.style.borderColor = 'rgba(0, 255, 135, 0.3)';
    } else if (window.ethereum && window.ethereum.isMetaMask) {
      userTypeBadge.innerText = 'METAMASK';
      userTypeBadge.style.color = '#F59E0B';
      userTypeBadge.style.background = 'rgba(245, 158, 11, 0.15)';
      userTypeBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    } else {
      userTypeBadge.innerText = 'DYNAMIC WALLET';
      userTypeBadge.style.color = 'var(--kobo-green)';
      userTypeBadge.style.background = 'rgba(0, 255, 135, 0.15)';
      userTypeBadge.style.borderColor = 'rgba(0, 255, 135, 0.3)';
    }
  }

  // 7. Trade Modal Displays
  const tradeBalEl = document.getElementById('tradeUserBalance');
  if (tradeBalEl && currentTradeTab === 'buy') {
    tradeBalEl.innerText = '₦' + userCngnBalance.toLocaleString('en-NG', { maximumFractionDigits: 0 });
  }

  const tradeGasEl = document.getElementById('tradeGasBadge');
  if (tradeGasEl) {
    tradeGasEl.innerText = (userEthBalance ? userEthBalance.toFixed(4) : '0.0000') + ' ETH';
  }

  const tradeAccEl = document.getElementById('tradeAccountDisplay');
  if (tradeAccEl) {
    tradeAccEl.innerText = userWalletAddress ? shortenAddress(userWalletAddress) : 'No wallet connected';
    tradeAccEl.style.color = userWalletAddress ? 'var(--kobo-green)' : '#F59E0B';
  }
}

async function refreshAllData() {
  try {
    const configRes = await fetch('/api/config');
    appConfig = await configRes.json();

    const tokensRes = await fetch('/api/tokens');
    const data = await tokensRes.json();
    allTokens = data.tokens || [];
    allTrades = data.trades || [];

    if (userWalletAddress) {
      const cngnRes = await fetch(`/api/cngn-balance?address=${userWalletAddress}`);
      const cngnData = await cngnRes.json();
      if (cngnData.success && typeof cngnData.balance === 'number') {
        userCngnBalance = cngnData.balance;
      }

      const nairaRes = await fetch(`/api/naira-balance?address=${userWalletAddress}`);
      const nairaData = await nairaRes.json();
      if (nairaData.success && typeof nairaData.balanceNaira === 'number') {
        if (Date.now() - lastDepositLockTimestamp < 30000 && nairaData.balanceNaira < lastDepositLockedAmount) {
          userNairaBalance = lastDepositLockedAmount;
        } else {
          userNairaBalance = nairaData.balanceNaira;
        }
      }

      const ethRes = await fetch(`/api/eth-balance?address=${userWalletAddress}`);
      const ethData = await ethRes.json();
      if (ethData.success && typeof ethData.balanceEth === 'number') {
        userEthBalance = ethData.balanceEth;
      }

      if (selectedToken) {
        const tokRes = await fetch(`/api/token-balance?address=${userWalletAddress}&tokenAddress=${selectedToken.address}`);
        const tokData = await tokRes.json();
        if (tokData.success && typeof tokData.balance === 'number') {
          userTokenBalance = tokData.balance;
        }
      }
    }

    renderOdogwu();
    renderTokens();
    renderTrades();
    updateBalancesInUI();

    // If trade modal is currently open, refresh its data, charts and trades live
    const tradeModal = document.getElementById('tradeModal');
    if (selectedToken && tradeModal && tradeModal.classList.contains('active')) {
      if (typeof refreshTradeModalData === 'function') {
        await refreshTradeModalData();
      }
    }
  } catch (err) {
    console.warn('Data refresh error:', err);
  }
}

function syncDynamicState() {
  let address = window.dynamicAddress;
  let user = window.dynamicUser;
  let isAuth = window.dynamicIsAuthenticated;

  // 1. If Dynamic reports an authenticated user, extract the verified address
  if (isAuth) {
    if (!address && user) {
      const cred = user.verifiedCredentials?.find(c => c.address);
      if (cred && cred.address) {
        address = cred.address;
      }
    }
  }

  // 2. If user is explicitly not authenticated, clear state
  if (!address) {
    if (isAuth === false && userWalletAddress !== null) {
      userWalletAddress = null;
      userNairaBalance = 0;
      userCngnBalance = 0;
      userEthBalance = 0;
      updateBalancesInUI();
    }
    return;
  }

  // 3. If address changed or newly acquired, synchronize balances and update UI
  if (address && address.toLowerCase() !== (userWalletAddress || '').toLowerCase()) {
    userWalletAddress = address;
    console.log('🔗 [Wallet Sync] Active address synchronized:', address);
    updateBalancesInUI();

    fetch(`/api/naira-balance?address=${address}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && typeof d.balanceNaira === 'number') {
          if (Date.now() - lastDepositLockTimestamp < 30000 && d.balanceNaira < lastDepositLockedAmount) {
            userNairaBalance = lastDepositLockedAmount;
          } else {
            userNairaBalance = d.balanceNaira;
          }
          updateBalancesInUI();
        }
      })
      .catch(console.warn);

    fetch(`/api/cngn-balance?address=${address}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && typeof d.balance === 'number') {
          userCngnBalance = d.balance;
          updateBalancesInUI();
        }
      })
      .catch(console.warn);

    fetch(`/api/eth-balance?address=${address}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && typeof d.balanceEth === 'number') {
          userEthBalance = d.balanceEth;
          updateBalancesInUI();
          checkGasAlertOnLogin(address, userEthBalance);
        }
      })
      .catch(console.warn);
  }

  if (user && user.email) {
    const depositEmail = document.getElementById('hubDepositEmail');
    if (depositEmail && (!depositEmail.value || depositEmail.value === 'trader@kobo.xyz')) {
      depositEmail.value = user.email;
    }
  }
}


// Check gas alert on sign up / login
function checkGasAlertOnLogin(address, balEth) {
  const banner = document.getElementById('gasWarningBanner');
  if (balEth < 0.0005) {
    if (banner) banner.style.display = 'block';
    const notifiedKey = 'kobo_gas_notified_' + address;
    if (!sessionStorage.getItem(notifiedKey)) {
      sessionStorage.setItem(notifiedKey, 'true');
      setTimeout(() => {
        if (window.openAccountHub) window.openAccountHub('tab-gas');
      }, 700);
    }
  } else {
    if (banner) banner.style.display = 'none';
  }
}

// Banner Open Gas handler -> opens Account Hub Gas tab
const btnBannerOpenGas = document.getElementById('btnBannerOpenGas');
if (btnBannerOpenGas) {
  btnBannerOpenGas.addEventListener('click', () => {
    if (window.openAccountHub) window.openAccountHub('tab-gas');
  });
}

const btnDismissGasBanner = document.getElementById('btnDismissGasBanner');
if (btnDismissGasBanner) {
  btnDismissGasBanner.addEventListener('click', () => {
    const banner = document.getElementById('gasWarningBanner');
    if (banner) banner.style.display = 'none';
  });
}

window.addEventListener('dynamic:state_change', syncDynamicState);
setInterval(syncDynamicState, 400);

// Multi-user real-time sync: Poll backend database & Base Sepolia on-chain curve stats every 3 seconds
setInterval(refreshAllData, 3000);

// Run init
initApp();
syncDynamicState();

// ==========================================
// MOBILE NAVIGATION & DRAWER CONTROLLER
// ==========================================
window.toggleMobileDrawer = function() {
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileDrawerOverlay');
  if (drawer && overlay) {
    const isActive = drawer.classList.contains('active');
    if (isActive) {
      window.closeMobileDrawer();
    } else {
      window.openMobileDrawer();
    }
  }
};

window.openMobileDrawer = function() {
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileDrawerOverlay');
  if (drawer) drawer.classList.add('active');
  if (overlay) overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeMobileDrawer = function() {
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileDrawerOverlay');
  if (drawer) drawer.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
};

window.mobileNav = function(page) {
  window.closeMobileDrawer();

  // Update mobile bottom nav active state
  document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab-name') === page);
  });

  // Update mobile drawer active items
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-mobile-page') === page);
  });

  // Trigger main sidebarNav logic
  if (window.sidebarNav) {
    const desktopBtn = document.querySelector(`.sidebar-nav-btn[data-page="${page}"]`);
    window.sidebarNav(page, desktopBtn);
  }

  // Smooth scroll up to tokens grid
  const grid = document.getElementById('tokensGrid');
  if (grid) {
    const yOffset = -70;
    const y = grid.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
};

window.mobileOpenHub = function(tabName) {
  window.closeMobileDrawer();
  if (!userWalletAddress) {
    if (window.openDynamicModal) window.openDynamicModal();
  } else {
    if (window.openAccountHub) window.openAccountHub(tabName);
  }
};

window.mobileDrawerAccountAction = function() {
  window.closeMobileDrawer();
  if (!userWalletAddress) {
    if (window.openDynamicModal) window.openDynamicModal();
  } else {
    if (window.openAccountHub) window.openAccountHub('tab-portfolio');
  }
};

// Wire Mobile Top Bar Wallet Button
const btnMobileWallet = document.getElementById('btnMobileWallet');
if (btnMobileWallet) {
  btnMobileWallet.addEventListener('click', () => {
    if (!userWalletAddress) {
      if (window.openDynamicModal) window.openDynamicModal();
    } else {
      if (window.openAccountHub) window.openAccountHub('tab-portfolio');
    }
  });
}

