import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSummary } from '../api';
import { toast } from 'react-hot-toast';
import { getToday } from '../constants';

const today = () => getToday();

const getFYStart = () => {
    const now = new Date();
    const yr = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${yr}-04-01`;
};

const getFYLabel = () => {
    const now = new Date();
    const yr = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `FY ${yr}-${String(yr + 1).slice(2)}`;
};

export default function useSummary() {
    const [summary, setSummary] = useState(null);
    const [initialLoad, setInitialLoad] = useState(true);
    const [dateFrom, setDateFrom] = useState(getFYStart());
    const [dateTo, setDateTo] = useState(today());
    const [activePreset, setActivePreset] = useState(getFYLabel());

    const setRange = useCallback((from, to, preset = '') => {
        setDateFrom(from);
        setDateTo(to);
        setActivePreset(preset);
    }, []);

    const resetRange = useCallback(() => {
        setDateFrom(getFYStart());
        setDateTo(today());
        setActivePreset(getFYLabel());
    }, []);

    const refresh = useCallback(async () => {
        try {
            const data = await getSummary(dateFrom, dateTo);
            setSummary(data);
        } catch (err) {
            console.error('Summary fetch failed', err);
            toast.error('Could not reach server.');
        } finally {
            setInitialLoad(false);
        }
    }, [dateFrom, dateTo]);

    useEffect(() => { refresh(); }, [refresh]);

    // Derived
    const banks = useMemo(() => summary?.banks || [], [summary]);
    const allCards = useMemo(() => summary?.cards || [], [summary]);
    const grandTotal = useMemo(() => summary?.grand_total || 0, [summary]);
    const cardsByBank = useMemo(() => {
        return allCards.reduce((acc, c) => {
            (acc[c.bank_name] = acc[c.bank_name] || []).push(c);
            return acc;
        }, {});
    }, [allCards]);

    return { summary, initialLoad, dateFrom, dateTo, activePreset, setRange, refresh, banks, allCards, grandTotal, cardsByBank, resetRange };
}
