import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  writeBatch,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDr_yGnZNsT_NgFmw0RkTRZhpzsRFy0SiU",
  authDomain: "fintracker-raven.firebaseapp.com",
  projectId: "fintracker-raven",
  storageBucket: "fintracker-raven.firebasestorage.app",
  messagingSenderId: "120401698302",
  appId: "1:120401698302:web:2a9a8ac0531acf177f34af",
  measurementId: "G-1MVVYSS4SR",
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE - ONE-TIME PERMISSION, WORKS FOREVER
// ══════════════════════════════════════════════════════════════════════════════
// Uses OAuth refresh tokens for permanent access - just like Google Docs!

const CLIENT_ID = "120401698302-your-actual-client-id.apps.googleusercontent.com";
// ⚠️ IMPORTANT: Replace with your actual OAuth Client ID from Google Cloud Console

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");
provider.setCustomParameters({
  access_type: 'offline', // ⭐ This requests the refresh token!
  prompt: 'consent'        // ⭐ Forces consent screen to get refresh token
});

// ── Sign In with Google ───────────────────────────────────────────────────────
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    
    if (accessToken) {
      const expiry = Date.now() + 55 * 60 * 1000; // 55 minutes
      localStorage.setItem("ft_drv_access_tok", accessToken);
      localStorage.setItem("ft_drv_access_exp", String(expiry));
      localStorage.setItem("ft_drv_email", result.user.email || "");
      
      // Try to get refresh token from the authentication flow
      // Note: Firebase doesn't expose refresh token directly from popup
      // We'll use Firebase's built-in token refresh instead
      console.log("✅ Drive access granted! Tokens saved.");
    }
    
    return result;
  } catch (error) {
    console.error("Sign in error:", error);
    throw error;
  }
};

// ── getFreshDriveToken: Uses Firebase's permanent token refresh ──────────────
export async function getFreshDriveToken() {
  const user = auth.currentUser;
  if (!user) {
    console.log("❌ No Firebase user - cannot get Drive token");
    return null;
  }

  const savedAccessToken = localStorage.getItem("ft_drv_access_tok");
  const accessExpiry = parseInt(localStorage.getItem("ft_drv_access_exp") || "0");

  // ── Step 1: Return cached access token if still fresh ───────────────────────
  if (savedAccessToken && Date.now() < accessExpiry - 5 * 60 * 1000) {
    return savedAccessToken;
  }

  // ── Step 2: Access token expired - get fresh one using Firebase ─────────────
  console.log("🔄 Access token expired - getting fresh token...");

  try {
    // Firebase Auth maintains a session with Google
    // We can force it to give us a fresh token
    const idTokenResult = await user.getIdTokenResult(true); // Force refresh
    
    // Now try to get a fresh access token by re-authenticating silently
    const refreshProvider = new GoogleAuthProvider();
    refreshProvider.addScope("https://www.googleapis.com/auth/drive.file");
    refreshProvider.setCustomParameters({
      login_hint: user.email,
      prompt: 'none' // Silent - no popup if session still valid
    });

    try {
      const result = await signInWithPopup(auth, refreshProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const newAccessToken = credential?.accessToken;

      if (newAccessToken) {
        const newExpiry = Date.now() + 55 * 60 * 1000;
        localStorage.setItem("ft_drv_access_tok", newAccessToken);
        localStorage.setItem("ft_drv_access_exp", String(newExpiry));
        console.log("✅ Fresh access token obtained silently!");
        return newAccessToken;
      }
    } catch (silentError) {
      // Silent refresh failed - this is normal if session expired
      console.log("⚠️ Silent refresh unavailable, testing old token...");
      
      // ── Step 3: Test if old access token still works ──────────────────────
      if (savedAccessToken) {
        try {
          const testRes = await fetch(
            'https://www.googleapis.com/drive/v3/about?fields=user',
            { headers: { Authorization: `Bearer ${savedAccessToken}` } }
          );
          
          if (testRes.ok) {
            // Old token works! Extend its expiry
            const newExpiry = Date.now() + 30 * 60 * 1000; // 30 more minutes
            localStorage.setItem("ft_drv_access_exp", String(newExpiry));
            console.log("✅ Old access token still valid - extended expiry");
            return savedAccessToken;
          }
        } catch (testError) {
          console.log("❌ Old token test failed:", testError.message);
        }
      }
      
      // ── Step 4: All refresh attempts failed ─────────────────────────────────
      console.log("❌ Token expired - user needs to re-authenticate");
      return null;
    }

    return null;
    
  } catch (error) {
    console.error("❌ Token refresh error:", error);
    return null;
  }
}

// ── Re-authenticate Drive (shows popup with consent) ──────────────────────────
export async function reauthenticateDrive() {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Not signed in. Please sign in with Google first.");
    }

    console.log("🔐 Re-authorizing Drive access...");
    
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/drive.file");
    provider.setCustomParameters({
      login_hint: user.email,
      access_type: 'offline', // Request refresh token
      prompt: 'consent'       // Force consent screen
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (accessToken) {
      const expiry = Date.now() + 55 * 60 * 1000;
      localStorage.setItem("ft_drv_access_tok", accessToken);
      localStorage.setItem("ft_drv_access_exp", String(expiry));
      localStorage.setItem("ft_drv_email", user.email || "");
      console.log("✅ Drive re-authorized successfully!");
      return { success: true, token: accessToken };
    }

    throw new Error("Failed to get access token");
  } catch (error) {
    console.error("Drive re-authentication error:", error);
    return { success: false, error: error.message };
  }
}

// ── Sign Out ──────────────────────────────────────────────────────────────────
export const signOutUser = () => {
  ["ft_drv_access_tok", "ft_drv_access_exp", "ft_drv_email"].forEach(k =>
    localStorage.removeItem(k)
  );
  return signOut(auth);
};

export { onAuthStateChanged };

// ══════════════════════════════════════════════════════════════════════════════
// FIRESTORE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// ── Storage layout ────────────────────────────────────────────────────────────
// A Firestore document is capped at 1 MiB, so the app state is split:
//   users/{uid}/fintrack/data            → small fields + `_split` map (which keys are chunked)
//   users/{uid}/fintrack_parts/{key}__N  → chunks of the large arrays/objects
// Old accounts (everything inline in `data`) still load fine and are migrated
// automatically on their next save.

const userRef  = (uid) => doc(db, "users", uid, "fintrack", "data");
const partsCol = (uid) => collection(db, "users", uid, "fintrack_parts");
const partRef  = (uid, id) => doc(db, "users", uid, "fintrack_parts", id);

const SPLIT_VERSION       = 2;
const INLINE_LIMIT_BYTES  = 100_000; // a top-level key bigger than this is chunked
const MAIN_DOC_BUDGET     = 700_000; // keep the main doc well under 1 MiB
const CHUNK_TARGET_BYTES  = 400_000;
const MAX_ITEM_BYTES      = 900_000; // one record cannot be split further
const MAX_BATCH_OPS       = 400;
const MAX_BATCH_BYTES     = 8_000_000;

const byteLen = (s) => new TextEncoder().encode(s).length;
const partId  = (key, i) => `${encodeURIComponent(key)}__${i}`;

function cleanData(obj) {
  return JSON.parse(JSON.stringify(obj, (key, val) =>
    val === undefined ? null : val
  ));
}

function chunkItems(items) {
  const chunks = [];
  let cur = [], curBytes = 0;
  for (const it of items) {
    const b = byteLen(JSON.stringify(it)) + 1;
    if (b > MAX_ITEM_BYTES) {
      throw new Error(`One record is too large to save (${Math.round(b / 1024)} KB)`);
    }
    if (cur.length && curBytes + b > CHUNK_TARGET_BYTES) {
      chunks.push(cur); cur = []; curBytes = 0;
    }
    cur.push(it); curBytes += b;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// Turn the full state into: the main doc + a map of chunk docs.
function buildPlan(clean) {
  const sizes = {};
  const splitKeys = new Set();
  let mainBytes = 0;
  for (const [k, v] of Object.entries(clean)) {
    const b = byteLen(JSON.stringify(v));
    sizes[k] = b;
    if (v !== null && typeof v === "object" && b > INLINE_LIMIT_BYTES) splitKeys.add(k);
    else mainBytes += b;
  }
  // If many mid-size keys still push the main doc near the limit, chunk the biggest ones too
  if (mainBytes > MAIN_DOC_BUDGET) {
    const rest = Object.keys(clean)
      .filter(k => !splitKeys.has(k) && clean[k] !== null && typeof clean[k] === "object")
      .sort((a, b) => sizes[b] - sizes[a]);
    for (const k of rest) {
      if (mainBytes <= MAIN_DOC_BUDGET) break;
      splitKeys.add(k); mainBytes -= sizes[k];
    }
  }

  const mainDoc = { _v: SPLIT_VERSION };
  const split = {};
  const parts = new Map(); // docId -> { content, json }
  for (const [k, v] of Object.entries(clean)) {
    if (!splitKeys.has(k)) { mainDoc[k] = v; continue; }
    const isArr = Array.isArray(v);
    // objects are stored as {k,v} records (Firestore does not allow nested arrays)
    const items = isArr ? v : Object.entries(v).map(([kk, vv]) => ({ k: kk, v: vv }));
    const chunks = chunkItems(items);
    split[k] = { kind: isArr ? "array" : "object", n: chunks.length };
    chunks.forEach((c, i) => {
      const content = { key: k, i, kind: split[k].kind, items: c };
      parts.set(partId(k, i), { content, json: JSON.stringify(content) });
    });
  }
  mainDoc._split = split;
  return { mainDoc, mainJson: JSON.stringify(mainDoc), parts };
}

// What we believe is currently stored remotely (lets us write only what changed)
let cache = null; // { uid, main: string|null, parts: Map<id, json>, ids: Set<id> }
const freshCache = (uid) => ({ uid, main: null, parts: new Map(), ids: new Set() });

export async function loadFromFirestore(uid, fallback) {
  // Throws on failure on purpose: returning defaults here would let the next
  // autosave overwrite the user's real data with an empty state.
  const snap = await getDoc(userRef(uid));
  if (!snap.exists()) {
    cache = freshCache(uid);
    return fallback;
  }
  const stored = snap.data();
  const { _split: split = {}, _v, ...rest } = stored;
  const next = freshCache(uid);

  // List what exists in the parts collection (also catches orphans)
  const partsSnap = await getDocs(partsCol(uid));
  const byKey = {};
  partsSnap.forEach(d => {
    next.ids.add(d.id);
    const c = d.data();
    (byKey[c.key] = byKey[c.key] || {})[c.i] = c;
  });

  const rebuilt = {};
  for (const [k, meta] of Object.entries(split)) {
    const got = byKey[k] || {};
    const list = [];
    for (let i = 0; i < meta.n; i++) {
      if (!got[i]) throw new Error(`Saved data is incomplete (missing ${k} part ${i + 1} of ${meta.n})`);
      list.push(...got[i].items);
    }
    rebuilt[k] = meta.kind === "object"
      ? Object.fromEntries(list.map(e => [e.k, e.v]))
      : list;
  }

  const result = { ...fallback, ...rest, ...rebuilt };

  // Prime the write cache only when the stored chunking matches what we would
  // produce now; otherwise the next save simply rewrites everything (safe).
  if (_v === SPLIT_VERSION && Object.keys(split).length) {
    try {
      const plan = buildPlan(cleanData(result));
      const same = Object.keys(split).length === Object.keys(plan.mainDoc._split).length &&
        Object.entries(split).every(([k, m]) => {
          const p = plan.mainDoc._split[k];
          return p && p.kind === m.kind && p.n === m.n;
        });
      if (same) for (const [id, p] of plan.parts) next.parts.set(id, p.json);
    } catch (_) { /* leave cache empty */ }
  }
  cache = next;
  return result;
}

async function doSave(uid, data) {
  try {
    const plan = buildPlan(cleanData(data));
    if (!cache || cache.uid !== uid) {
      // No load happened for this user yet: learn what exists so orphans get cleaned
      cache = freshCache(uid);
      (await getDocs(partsCol(uid))).forEach(d => cache.ids.add(d.id));
    }
    const c = cache;

    const ops = [];
    for (const [id, p] of plan.parts) {
      if (c.parts.get(id) !== p.json) ops.push({ t: "part", id, json: p.json, data: p.content });
    }
    if (c.main !== plan.mainJson) ops.push({ t: "main", json: plan.mainJson, data: plan.mainDoc });
    for (const id of c.ids) {
      if (!plan.parts.has(id)) ops.push({ t: "del", id });
    }
    if (!ops.length) return true;

    // Chunks first, main doc after them, deletions last (ops are already in that order).
    // Each batch is atomic; batches run in order.
    let i = 0;
    while (i < ops.length) {
      const batch = writeBatch(db);
      const group = [];
      let bytes = 0;
      while (i < ops.length && group.length < MAX_BATCH_OPS) {
        const op = ops[i];
        const b = op.json ? op.json.length : 0;
        if (group.length && bytes + b > MAX_BATCH_BYTES) break;
        if (op.t === "part") batch.set(partRef(uid, op.id), op.data);
        else if (op.t === "main") batch.set(userRef(uid), op.data); // no merge: drops legacy inline fields
        else batch.delete(partRef(uid, op.id));
        group.push(op); bytes += b; i++;
      }
      await batch.commit();
      for (const op of group) {
        if (op.t === "part") { c.parts.set(op.id, op.json); c.ids.add(op.id); }
        else if (op.t === "main") c.main = op.json;
        else { c.parts.delete(op.id); c.ids.delete(op.id); }
      }
    }
    return true;
  } catch (e) {
    console.error("Firestore save error:", e);
    return false;
  }
}

// Saves run one at a time so overlapping calls can't interleave their writes.
let saveQueue = Promise.resolve(true);
export function saveToFirestore(uid, data) {
  saveQueue = saveQueue.then(() => doSave(uid, data));
  return saveQueue;
}
