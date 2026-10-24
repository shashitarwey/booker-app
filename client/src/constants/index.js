// ─── Today's date helper (always fresh, never stale) ───────────────────────
// Local calendar date (the user's timezone, e.g. IST), as YYYY-MM-DD.
// Never use toISOString() for "today": that's UTC, so in India it returns
// yesterday between 00:00 and 05:30.
export const getToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Pagination ────────────────────────────────────────────────────────────
export const PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// ─── Banks ─────────────────────────────────────────────────────────────────
// Key = IFSC prefix (bank code), Value = full bank name
export const BANKS = {
    SBIN: 'State Bank of India',
    BARB: 'Bank of Baroda',
    PUNB: 'Punjab National Bank',
    CNRB: 'Canara Bank',
    UBIN: 'Union Bank of India',
    BKID: 'Bank of India',
    IDIB: 'Indian Bank',
    CBIN: 'Central Bank of India',
    IOBA: 'Indian Overseas Bank',
    MAHB: 'Bank of Maharashtra',
    UCBA: 'UCO Bank',
    PSIB: 'Punjab & Sind Bank',
    HDFC: 'HDFC Bank',
    ICIC: 'ICICI Bank',
    UTIB: 'Axis Bank',
    KKBK: 'Kotak Mahindra Bank',
    INDB: 'IndusInd Bank',
    YESB: 'YES Bank',
    RATN: 'RBL Bank',
    IDFB: 'IDFC FIRST Bank',
    FDRL: 'Federal Bank',
    SIBL: 'South Indian Bank',
    KARB: 'Karnataka Bank',
    KVBL: 'Karur Vysya Bank',
    BDBL: 'Bandhan Bank',
    IBKL: 'IDBI Bank',
    AUBL: 'AU Small Finance Bank',
    ESFB: 'Equitas Small Finance Bank',
    AMEX: 'American Express Banking Corp.',
    SCBL: 'Standard Chartered Bank',
    HSBC: 'HSBC India',
    DBSS: 'DBS Bank India',
};

/** Sorted array of bank names for datalist / dropdowns */
export const BANK_NAMES = Object.values(BANKS).sort((a, b) => a.localeCompare(b));

/** Lookup: bank name → IFSC prefix */
export const BANK_NAME_TO_CODE = Object.fromEntries(
    Object.entries(BANKS).map(([code, name]) => [name, code])
);

// ─── Card holders ──────────────────────────────────────────────────────────
export const RELATIONS = {
    self:   { label: 'Self',   color: '#58a6ff' },
    family: { label: 'Family', color: '#a6e3a1' },
    friend: { label: 'Friend', color: '#f9a875' },
};

export const CARD_TYPES = [
    { value: 'primary', label: 'Primary' },
    { value: 'addon',   label: 'Add-on' },
];

// ─── Card Networks ─────────────────────────────────────────────────────────
export const CARD_NETWORKS = ['Visa', 'Mastercard', 'AmEx', 'RuPay'];

// ─── Cashback Periods ──────────────────────────────────────────────────────
export const CASHBACK_PERIODS = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'half-yearly', label: 'Half-Yearly' },
    { value: 'yearly', label: 'Yearly' },
];

// ─── Months ───────────────────────────────────────────────────────────────
export const MONTHS = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
];

// ─── Card network display config ───────────────────────────────────────────
export const NETWORK_COLORS = {
    Visa: { bg: '#1a1f6e', text: '#fff', label: 'VISA' },
    Mastercard: { bg: '#eb001b', text: '#fff', label: 'MC' },
    AmEx: { bg: '#007bc1', text: '#fff', label: 'AMEX' },
    RuPay: { bg: '#2c7a3e', text: '#fff', label: 'RuPay' },
};

// ─── E-commerce sites ──────────────────────────────────────────────────────
export const ECOMM_SITES = [
    'Amazon',
    'Flipkart',
    'Myntra',
    'Ajio',
    'JioMart',
    'Samsung Store',
    'Oneplus Store',
    'Realme Store',
    'Reliance Digital',
    'Tata Neu',
    'Croma',
    'Other'
];

// ─── Phone/device variants ─────────────────────────────────────────────────
// Fallback only — the live list (incl. user-added variants) comes from GET /api/variants
export const VARIANTS = [
    'NA',
    '6/128',
    '8/128',
    '8/256',
    '12/256',
    '4/64',
    '4/128',
    '12/1024',
    '12/512'
];

// ─── Order delivery status ─────────────────────────────────────────────────
export const DELIVERY_STATUS_OPTIONS = [
    { label: 'Pending', value: 'Pending' },
    { label: 'Delivered', value: 'Delivered' },
    { label: 'Cancelled', value: 'Cancelled' },
];

// Simple label list for filter dropdowns (prepend "All")
export const STATUS_FILTER_OPTIONS = ['All', 'Pending', 'Delivered', 'Cancelled'];
