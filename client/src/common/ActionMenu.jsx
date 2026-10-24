import { useRef } from 'react';
import usePopoverPlacement from './usePopoverPlacement';
import { EllipsisVertical } from 'lucide-react';

/**
 * Reusable 3-dot action menu with a fixed overlay to dismiss on outside click.
 *
 * Props:
 *  - id          {string}   unique id for the row (used to track which menu is open)
 *  - openId      {string}   currently open menu's id (from parent state)
 *  - onToggle    {function} called with id (or null to close)
 *  - items       {Array}    menu items: [{ label, icon, onClick, color?, className? }]
 */
export default function ActionMenu({ id, openId, onToggle, items }) {
    const isOpen = openId === id;
    const btnRef = useRef(null);
    const menuRef = useRef(null);
    // Right-aligned under the button; flips up near the bottom of the screen
    const menuStyle = usePopoverPlacement(isOpen, btnRef, menuRef, { align: 'end', gap: 4, zIndex: 10 });

    return (
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
            <button
                ref={btnRef}
                className="icon-btn"
                onClick={e => { e.stopPropagation(); onToggle(isOpen ? null : id); }}
            >
                <EllipsisVertical size={16} />
            </button>

            {isOpen && (
                <>
                    {/* Backdrop — closes menu on outside click */}
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 9 }}
                        onClick={e => { e.stopPropagation(); onToggle(null); }}
                    />

                    <div ref={menuRef} style={{
                        ...menuStyle,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                        minWidth: '150px',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        {items.map((item, i) => (
                            <button
                                key={i}
                                className={`dropdown-item${item.className ? ` ${item.className}` : ''}`}
                                onClick={e => { e.stopPropagation(); item.onClick(); onToggle(null); }}
                                style={{ color: item.color || 'var(--text)' }}
                            >
                                {item.icon} {item.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
