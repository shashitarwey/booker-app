import axios from 'axios';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });

// Attach JWT token from localStorage to every request
API.interceptors.request.use(cfg => {
    const token = localStorage.getItem('cv_token');
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
});

// ── Short-lived GET cache ──────────────────────────────────────────────────
// Several screens (dashboard, person page, order form) ask for the same
// people / cards / buyers / summary within seconds. Identical GETs share one
// request for CLIENT_TTL; any successful write clears the whole cache so the
// next read is always fresh. Callers get their own copy (structuredClone),
// so mutating a result can never leak into another screen.
const CLIENT_TTL = 30_000;
const getCache = new Map();

const cachedGet = (url, params) => {
    const key = `${url}?${JSON.stringify(params || {})}`;
    const hit = getCache.get(key);
    if (!hit || Date.now() - hit.at > CLIENT_TTL) {
        const promise = API.get(url, { params }).then(r => r.data);
        promise.catch(() => getCache.delete(key));
        getCache.set(key, { at: Date.now(), promise });
    }
    return getCache.get(key).promise.then(d => structuredClone(d));
};

export const clearApiCache = () => getCache.clear();

// Response interceptor — clear cache on writes, auto-logout on 401, centralized error logging
API.interceptors.response.use(
    res => {
        if (res.config.method !== 'get') getCache.clear();
        return res;
    },
    err => {
        if (err.response?.status === 401) {
            getCache.clear();
            localStorage.removeItem('cv_token');
            localStorage.removeItem('cv_user');
            window.location.href = '/';
        }
        console.error(`[API ${err.config?.method?.toUpperCase()} ${err.config?.url}]`, err.response?.data?.error || err.message);
        return Promise.reject(err);
    }
);

// ── Auth ──
export const loginUser = (data) => API.post('/auth/login', data).then(r => r.data);
export const registerUser = (data) => API.post('/auth/register', data).then(r => r.data);
export const updateProfile = (data) => API.put('/auth/profile', data).then(r => r.data);
export const changePassword = (data) => API.put('/auth/change-password', data).then(r => r.data);
export const requestAccountDeletion = () => API.post('/auth/request-deletion').then(r => r.data);
export const cancelAccountDeletion = () => API.post('/auth/cancel-deletion').then(r => r.data);
export const getAccountStatus = () => API.get('/auth/account-status').then(r => r.data);
export const forgotPassword = (data) => API.post('/auth/forgot-password', data).then(r => r.data);
export const resetPassword = (token, data) => API.post(`/auth/reset-password/${token}`, data).then(r => r.data);

// ── Backup ──
// Downloads every record of the account as one JSON file
export const exportAccount = async () => {
  const res = await API.get('/export', { responseType: 'blob' });
  const name = /filename="?([^";]+)"?/.exec(res.headers['content-disposition'] || '')?.[1] || 'booker-backup.json';
  const url = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Restores a backup file into this (empty) account
export const importAccount = (backup) => API.post('/export/import', backup).then(r => r.data);

// ── Analytics ──
export const getProfitAnalytics = (params) => API.get('/analytics/profit', { params }).then(r => r.data);

// ── AI Assistant ──
export const askAI = (question, history) => API.post('/ai/ask', { question, history }).then(r => r.data);

// ── Cards ──
export const getCards = (params) => cachedGet('/cards', params);
export const createCard = (data) => API.post('/cards', data).then(r => r.data);
export const updateCard = (id, d) => API.put(`/cards/${id}`, d).then(r => r.data);
export const deleteCard = (id) => API.delete(`/cards/${id}`).then(r => r.data);
// Not cached: depends on the order date and changes with every order
export const getCashbackCycle = (id, params) => API.get(`/cards/${id}/cashback-cycle`, { params }).then(r => r.data);

// ── People (card holders: self / family / friends) ──
export const getPeople = (params) => cachedGet('/people', params);
export const getPerson = (id) => cachedGet(`/people/${id}`);
export const addPerson = (data) => API.post('/people', data).then(r => r.data);
export const updatePerson = (id, d) => API.put(`/people/${id}`, d).then(r => r.data);
export const deletePerson = (id) => API.delete(`/people/${id}`).then(r => r.data);
// Booker khata (friends): delivered orders owed, advances, payments made
export const getBookerKhata = (id, params) => API.get(`/people/${id}/khata`, { params }).then(r => r.data);
export const addBookerPayment = (id, d) => API.post(`/people/${id}/payments`, d).then(r => r.data);
export const updateBookerPayment = (paymentId, d) => API.put(`/people/payments/${paymentId}`, d).then(r => r.data);
export const deleteBookerPayment = (paymentId) => API.delete(`/people/payments/${paymentId}`).then(r => r.data);

// ── Variants (defaults + user's custom) ──
export const getVariants = () => cachedGet('/variants');
export const addVariant = (name) => API.post('/variants', { name }).then(r => r.data);

// ── Reports ──
export const getSpendReport = (params) => API.get('/reports/spends', { params }).then(r => r.data);

// ── Transactions ──
export const getTransactions = (p) => API.get('/transactions', { params: p }).then(r => r.data);
export const createTransaction = (d) => API.post('/transactions', d).then(r => r.data);
export const deleteTransaction = (id) => API.delete(`/transactions/${id}`).then(r => r.data);

// ── Summary ──
export const getSummary = (from_date, to_date) => cachedGet('/summary', { from_date, to_date });

// ── Orders ──
export const getOrders = (params) => API.get('/orders', { params }).then(r => r.data);  // returns { orders, total, page, limit }
export const getAllOrders = (params) => API.get('/orders', { params: { ...params, all: true } }).then(r => r.data);  // returns array
export const addOrder = (data) => API.post('/orders', data).then(r => r.data);
export const updateOrder = (id, d) => API.put(`/orders/${id}`, d).then(r => r.data);
export const deleteOrder = (id) => API.delete(`/orders/${id}`).then(r => r.data);
export const bulkUpdateStatus = (ids, delivery_status, delivered_date) => API.post('/orders/bulk/status', { ids, delivery_status, delivered_date }).then(r => r.data);
export const bulkMarkCleared = (ids, is_cleared) => API.post('/orders/bulk/clear', { ids, is_cleared }).then(r => r.data);
export const bulkDeleteOrders = (ids) => API.post('/orders/bulk/delete', { ids }).then(r => r.data);

// ── Sellers ──
export const getSellers = (params) => API.get('/sellers', { params }).then(r => r.data);  // returns { sellers, total, page, limit }
export const getAllSellers = () => cachedGet('/sellers', { all: true });  // returns array of all sellers (for dropdowns)
export const getSeller = (id) => API.get(`/sellers/${id}`).then(r => r.data);
export const addSeller = (data) => API.post('/sellers', data).then(r => r.data);
export const updateSeller = (id, d) => API.put(`/sellers/${id}`, d).then(r => r.data);
export const deleteSeller = (id) => API.delete(`/sellers/${id}`).then(r => r.data);

// ── Seller Payments ──
export const getSellerLedger = (sellerId) => API.get(`/sellers/${sellerId}/payment`).then(r => r.data);
export const getLedgerFeed = (sellerId, params) => API.get(`/sellers/${sellerId}/ledger-feed`, { params }).then(r => r.data);

export const addSellerPayment = (data) => API.post('/sellers/payment', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
}).then(r => r.data);

export const updateSellerPayment = (id, data) => API.put(`/sellers/payment/${id}`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
}).then(r => r.data);

export const deleteSellerPayment = (id) => API.delete(`/sellers/payment/${id}`).then(r => r.data);

// ── Khata Customers ──
export const getCustomers = (params) => API.get('/customers', { params }).then(r => r.data);
export const getCustomer = (id) => API.get(`/customers/${id}`).then(r => r.data);
export const addCustomer = (data) => API.post('/customers', data).then(r => r.data);
export const updateCustomer = (id, d) => API.put(`/customers/${id}`, d).then(r => r.data);
export const deleteCustomer = (id) => API.delete(`/customers/${id}`).then(r => r.data);

export const getCustomerEntries = (customerId) => API.get(`/customers/${customerId}/entries`).then(r => r.data);
export const getCustomerEntriesFeed = (customerId, params) => API.get(`/customers/${customerId}/entries-feed`, { params }).then(r => r.data);
export const addCustomerEntry = (data) => API.post('/customers/entry', data).then(r => r.data);
export const updateCustomerEntry = (id, data) => API.put(`/customers/entry/${id}`, data).then(r => r.data);
export const deleteCustomerEntry = (id) => API.delete(`/customers/entry/${id}`).then(r => r.data);

// ── Activity Log ──
export const getActivityLogs = (params) => API.get('/activity', { params }).then(r => r.data);
export const getEntityHistory = (entityId) => API.get(`/activity/entity/${entityId}`).then(r => r.data);
