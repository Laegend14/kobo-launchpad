const fs = require('fs');
const path = require('path');
const { initializeApp, getApps } = require('firebase/app');
const {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where
} = require('firebase/firestore');

// Safe loader if .env.local exists and wasn't loaded yet
function ensureEnvLoaded() {
  if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}
ensureEnvLoaded();

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyC2OPvnOW46HusWD-Y452Lfu1vYs4RVYrI",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "kobo-40800.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "kobo-40800",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "kobo-40800.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "517255636001",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:517255636001:web:4eb33b200058b472b42f60",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-EVEVC1SCET"
  };
}

const firebaseConfig = getFirebaseConfig();

let app = null;
let db = null;
let firestoreActive = false;

function initFirestore() {
  try {
    ensureEnvLoaded();
    const cfg = getFirebaseConfig();
    if (!app) {
      const existingApps = getApps();
      app = existingApps.length > 0 ? existingApps[0] : initializeApp(cfg);
    }
    if (!db) {
      db = getFirestore(app);
    }
    firestoreActive = true;
    console.log(`🔥 [Firebase] Initialized Firestore for project: ${cfg.projectId}`);
    return db;
  } catch (err) {
    console.warn('⚠️ [Firebase] Init notice:', err.message);
    firestoreActive = false;
    return null;
  }
}

// Check health / connectivity
async function checkFirestoreConnection() {
  try {
    if (!db) initFirestore();
    if (!db) return false;
    const snap = await getDocs(query(collection(db, 'tokens'), limit(1)));
    firestoreActive = true;
    return true;
  } catch (err) {
    // If not enabled or permission denied, set flag to false
    firestoreActive = false;
    return false;
  }
}

async function saveTokenFirestore(token) {
  if (!db) initFirestore();
  if (!db || !token || !token.address) return false;
  try {
    const docRef = doc(db, 'tokens', token.address.toLowerCase());
    await setDoc(docRef, {
      address: token.address.toLowerCase(),
      name: token.name,
      symbol: token.symbol,
      description: token.description || '',
      imageUri: token.imageUri || '',
      cultureTag: token.cultureTag || 'Meme',
      creator: token.creator || '',
      createdAt: token.createdAt || Date.now(),
      updatedAt: Date.now()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn(`[Firebase] saveToken failed for ${token.symbol}:`, err.message);
    return false;
  }
}

async function getAllTokensFirestore() {
  if (!db) initFirestore();
  if (!db) return [];
  try {
    const q = query(collection(db, 'tokens'), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    const tokens = [];
    snap.forEach(docSnap => {
      tokens.push(docSnap.data());
    });
    return tokens;
  } catch (err) {
    // If permission denied or disabled, return null to signal fallback to SQLite
    return null;
  }
}

async function getTokenFirestore(address) {
  if (!db || !address) return null;
  try {
    const docRef = doc(db, 'tokens', address.toLowerCase());
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    return null;
  }
}

async function saveTradeFirestore(trade) {
  if (!db) initFirestore();
  if (!db || !trade) return false;
  try {
    const tradeId = trade.id || 't-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const docRef = doc(db, 'trades', tradeId);
    await setDoc(docRef, {
      id: tradeId,
      tokenAddress: (trade.tokenAddress || '').toLowerCase(),
      tokenSymbol: trade.tokenSymbol || '',
      traderAddress: (trade.traderAddress || trade.trader || '').toLowerCase(),
      isBuy: Boolean(trade.isBuy),
      cngnAmount: Number(trade.cngnAmount || 0),
      tokenAmount: Number(trade.tokenAmount || 0),
      txHash: trade.txHash || '',
      createdAt: trade.createdAt || Date.now()
    });
    return true;
  } catch (err) {
    console.warn('[Firebase] saveTrade failed:', err.message);
    return false;
  }
}

async function getLatestTradesFirestore(limitCount = 30) {
  if (!db) initFirestore();
  if (!db) return null;
  try {
    const q = query(collection(db, 'trades'), orderBy('createdAt', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    const trades = [];
    snap.forEach(docSnap => {
      trades.push(docSnap.data());
    });
    return trades;
  } catch (err) {
    return null;
  }
}

async function getTradesForTokenFirestore(tokenAddress, limitCount = 50) {
  if (!db) initFirestore();
  if (!db || !tokenAddress) return null;
  try {
    // Query by tokenAddress without orderBy to avoid composite index requirement, then sort in memory
    const q = query(
      collection(db, 'trades'),
      where('tokenAddress', '==', tokenAddress.toLowerCase())
    );
    const snap = await getDocs(q);
    const trades = [];
    snap.forEach(docSnap => {
      trades.push(docSnap.data());
    });
    trades.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return trades.slice(0, limitCount);
  } catch (err) {
    console.warn('[Firebase] getTradesForToken error:', err.message);
    return null;
  }
}

async function saveDepositFirestore(deposit) {
  if (!db) initFirestore();
  if (!db || !deposit || !deposit.reference) return false;
  try {
    const docRef = doc(db, 'deposits', deposit.reference);
    await setDoc(docRef, {
      reference: deposit.reference,
      walletAddress: (deposit.walletAddress || '').toLowerCase(),
      amountNgn: Number(deposit.amountNgn || 0),
      status: deposit.status || 'success',
      createdAt: deposit.createdAt || Date.now()
    }, { merge: true });
    return true;
  } catch (err) {
    return false;
  }
}

async function getUserBalanceFirestore(walletAddress) {
  if (!db) initFirestore();
  if (!db || !walletAddress) return null;
  try {
    const docRef = doc(db, 'user_balances', walletAddress.toLowerCase());
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return Number(snap.data().nairaBalance || 0);
    }
    return 0;
  } catch (err) {
    console.warn('[Firebase] getUserBalance error:', err.message);
    return null;
  }
}

async function setUserBalanceFirestore(walletAddress, newBalance) {
  if (!db) initFirestore();
  if (!db || !walletAddress) return false;
  try {
    const docRef = doc(db, 'user_balances', walletAddress.toLowerCase());
    await setDoc(docRef, {
      walletAddress: walletAddress.toLowerCase(),
      nairaBalance: Number(newBalance || 0),
      updatedAt: Date.now()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('[Firebase] setUserBalance error:', err.message);
    return false;
  }
}

async function saveIpfsFileFirestore(cid, base64Content, mimeType) {
  if (!db) initFirestore();
  if (!db || !cid || !base64Content) return false;
  try {
    const docRef = doc(db, 'ipfs_files', cid);
    await setDoc(docRef, {
      cid,
      data: base64Content,
      mimeType: mimeType || 'image/png',
      createdAt: Date.now()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('[Firebase] saveIpfsFile notice:', err.message);
    return false;
  }
}

async function getIpfsFileFirestore(cid) {
  if (!db) initFirestore();
  if (!db || !cid) return null;
  try {
    const docRef = doc(db, 'ipfs_files', cid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  firebaseConfig,
  initFirestore,
  checkFirestoreConnection,
  saveTokenFirestore,
  getAllTokensFirestore,
  getTokenFirestore,
  saveTradeFirestore,
  getLatestTradesFirestore,
  getTradesForTokenFirestore,
  saveDepositFirestore,
  getUserBalanceFirestore,
  setUserBalanceFirestore,
  saveIpfsFileFirestore,
  getIpfsFileFirestore
};
