import React from 'react';
import { MoreVertical, Trash2, Plus, CalendarClock, AlertCircle, Star, Link2 } from 'lucide-react';
import { NETWORK_COLORS, RELATIONS } from '../constants';
import { fmtCurrency, ordinalSuffix } from '../utils/formatters';

const BANK_GRADIENTS = [
  'linear-gradient(135deg,#1e2a5a,#1a1f3a)',
  'linear-gradient(135deg,#2d1b5e,#1a1228)',
  'linear-gradient(135deg,#0e3a3a,#0d2424)',
  'linear-gradient(135deg,#5e1a2d,#2d0f18)',
  'linear-gradient(135deg,#4a2e00,#2a1a00)',
  'linear-gradient(135deg,#0a3a1e,#072010)',
  'linear-gradient(135deg,#0e2e4a,#071824)',
  'linear-gradient(135deg,#1e2530,#12171e)',
];

const bankGradient = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return BANK_GRADIENTS[Math.abs(h) % BANK_GRADIENTS.length];
};

const cashbackStatus = (earnedInCycle, limit) => {
  if (limit <= 0) return null;
  const remaining  = Math.max(limit - earnedInCycle, 0);
  const remainPct  = (remaining / limit) * 100;
  const cls = remainPct === 0 ? 'danger' : remainPct < 25 ? 'warn' : 'safe';
  return { cls, pct: remainPct, remaining, earned: earnedInCycle };
};

// Returns days until due this month (or next month if already passed)
const billingStatus = (dueDay) => {
  if (!dueDay) return null;
  const today = new Date();
  const todayDay = today.getDate();
  let daysLeft = dueDay - todayDay;
  if (daysLeft < 0) {
    // Already passed — calculate days until next month's due date
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
    daysLeft = Math.ceil((nextMonth - today) / 86400000);
  }
  const urgency = daysLeft <= 3 ? 'urgent' : daysLeft <= 7 ? 'warning' : 'ok';
  return { daysLeft, urgency };
};

const CardWidget = ({ card, profit = undefined, showHolder = true, onAddTx, onViewDetails, onEdit, onDelete }) => {
  const spend = card.total_spend || 0;
  const net   = NETWORK_COLORS[card.card_network] || NETWORK_COLORS.Visa;
  const cb    = card.cashback_enabled ? cashbackStatus(card.cashback_earned_cycle || 0, card.cashback_limit) : null;
  const bill  = billingStatus(card.due_date);
  const holder = card.holder_id && typeof card.holder_id === 'object' ? card.holder_id : null;
  const isAddon = card.card_type === 'addon';

  return (
    <div className="card-widget has-tab" style={{ background: bankGradient(card.bank_name) }}
         onClick={() => onViewDetails(card)}>
      {/* Folder-style tab on the top edge: card type at a glance */}
      <span className={`card-type-tab ${isAddon ? 'is-addon' : 'is-primary'}`}>
        {isAddon ? <Link2 size={11} strokeWidth={2.6} /> : <Star size={11} strokeWidth={2.6} />}
        {isAddon ? 'Add-on' : 'Primary'}
      </span>
      <div className="card-top-row">
        {/* Network always visible here, so the bottom-right can show profit */}
        <div className="card-top-left">
          <span className="card-bank">{card.bank_name}</span>
          <span className="card-network-badge" style={{ background: net.bg, color: net.text }}>{net.label}</span>
        </div>
        <div className="card-actions">
          <button className="card-more-btn" data-tooltip="Add transaction"
            onClick={e => { e.stopPropagation(); onAddTx(card); }}>
            <Plus size={16} />
          </button>
          <button className="card-more-btn" data-tooltip="Edit card"
            onClick={e => { e.stopPropagation(); onEdit(card); }}>
            <MoreVertical size={16} />
          </button>
          <button className="card-more-btn card-delete-btn" data-tooltip="Delete card"
            onClick={e => { e.stopPropagation(); onDelete(card); }}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="card-chip" />
      <div className="card-last-four-digit">•••• •••• •••• {card.last_four_digit}</div>
      <div className="card-name">{card.name_on_card}</div>
      {showHolder && holder && (
        <div className="card-holder-row">
          {(
            <span className="card-holder-chip" style={{ color: RELATIONS[holder.relation]?.color }}>
              {holder.name} · {RELATIONS[holder.relation]?.label || holder.relation}
            </span>
          )}
        </div>
      )}

      <div className="card-spend-row">
        <div>
          <div className="card-spend-label">PERIOD SPEND</div>
          <div className="card-spend-amount">{fmtCurrency(spend)}</div>
        </div>
        {profit !== undefined && (
          <div style={{ textAlign: 'right' }}>
            <div className="card-spend-label">PROFIT EARNED</div>
            <div className="card-spend-amount" style={{ /* card face is always dark */ color: profit >= 0 ? '#34d399' : '#f87171', fontSize: '1.2rem' }}>
              {profit > 0 ? '+' : ''}{fmtCurrency(profit)}
            </div>
          </div>
        )}
      </div>

      {cb && (
        <div className="cashback-section">
          <div className="cashback-meta">
            <span className="cashback-label">
              {card.cashback_percent}% cashback · ₹{cb.earned.toLocaleString('en-IN')} / ₹{card.cashback_limit.toLocaleString('en-IN')}
            </span>
            <span className={`cashback-pct ${cb.cls}`}>
              {cb.cls === 'danger'
                ? '⚠ Limit reached'
                : `₹${cb.remaining.toLocaleString('en-IN')} left`}
            </span>
          </div>
          <div className="progress-track">
            <div className={`progress-bar ${cb.cls}`} style={{ width: `${cb.pct}%` }} />
          </div>
          <div className="cashback-limit-note">Resets {{
            'monthly': 'monthly', 'quarterly': 'quarterly',
            'half-yearly': 'every 6 months', 'yearly': 'yearly'
          }[card.cashback_period] || 'monthly'} on {ordinalSuffix(card.cashback_reset_day || 1)}</div>
        </div>
      )}

      {/* Billing cycle reminder strip */}
      {bill && (
        <div className={`billing-reminder billing-${bill.urgency}`}>
          {bill.urgency === 'ok'
            ? <CalendarClock size={13} />
            : <AlertCircle size={13} />}
          <span>
            {bill.urgency === 'urgent'
              ? bill.daysLeft === 0 ? 'Due TODAY!' : `Due in ${bill.daysLeft}d — pay now!`
              : bill.urgency === 'warning'
              ? `Due in ${bill.daysLeft} days`
              : `Due on ${ordinalSuffix(card.due_date)} of month`}
          </span>
          {card.billing_date && (
            <span className="billing-statement-chip">Stmt: {ordinalSuffix(card.billing_date)}</span>
          )}
        </div>
      )}
      {!bill && card.billing_date && (
        <div className="billing-reminder billing-ok">
          <CalendarClock size={13} />
          <span>Statement: {ordinalSuffix(card.billing_date)} of month</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(CardWidget);
