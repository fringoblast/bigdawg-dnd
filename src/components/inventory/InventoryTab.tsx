import { useState, useMemo } from 'react';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useUIStore } from '@/state/useUIStore';
import { SRD_ITEMS } from '@/lib/srdItems';
import { uid } from '@/lib/storage';
import type { Item, ItemCategory, Currency, DamageType } from '@/types/character';
import { coinSfx, haptics } from '@/lib/audio';

const CATS: { id: ItemCategory; label: string; icon: string }[] = [
  { id: 'weapon', label: 'Weapons', icon: '⚔' },
  { id: 'armor', label: 'Armor', icon: '🛡' },
  { id: 'consumable', label: 'Consumables', icon: '🧪' },
  { id: 'gear', label: 'Gear', icon: '🎒' },
  { id: 'tool', label: 'Tools', icon: '🔧' },
  { id: 'treasure', label: 'Treasure', icon: '💰' },
  { id: 'misc', label: 'Misc', icon: '✦' }
];

const WEAPON_DAMAGE_TYPES: DamageType[] = ['slashing','piercing','bludgeoning','fire','cold','lightning','thunder','acid','poison','radiant','necrotic','psychic','force'];
const WEAPON_PROPERTIES = [
  'ammunition','finesse','heavy','light','loading','reach','special','thrown','two-handed','versatile','silvered','magical','keen','monk'
];

export default function InventoryTab() {
  const active = useCharacterStore(s => s.active());
  const update = useCharacterStore(s => s.update);
  const addItem = useCharacterStore(s => s.addItem);
  const removeItem = useCharacterStore(s => s.removeItem);
  const toggleEquip = useCharacterStore(s => s.toggleEquip);
  const showToast = useUIStore(s => s.showToast);
  const [tab, setTab] = useState<ItemCategory>('weapon');
  const [weaponView, setWeaponView] = useState<'my' | 'library' | 'custom'>('my');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [cn, setCn] = useState('');
  const [cq, setCq] = useState(1);
  const [ccat, setCcat] = useState<ItemCategory>('gear');
  const [autoConvert, setAutoConvert] = useState(false);

  if (!active) {
    return (
      <div className="p-4 text-center mt-8">
        <div className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>No hero</div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Create a character to manage inventory.</p>
      </div>
    );
  }

  const items = active.inventory.filter(i => i.category === tab);
  const total = Object.values(active.inventory).reduce((s, i) => s + (i.weight * i.qty), 0);

  const buyItem = (srd: typeof SRD_ITEMS[number]) => {
    const cost = srd.cost || 0;
    if (cost > 0 && !canAfford(active.currency, cost)) { showToast('Not enough gold', 'error'); return; }
    if (cost > 0) update(active.id, { currency: subtractCost(active.currency, cost) });
    coinSfx();
    addItem(active.id, {
      name: srd.name, qty: 1, weight: srd.weight || 0, category: srd.category,
      damage: srd.damage as any, ac: srd.ac, properties: srd.properties, range: srd.range, rarity: srd.rarity
    });
    showToast(`Added ${srd.name}`, 'success');
    setPickerOpen(false);
  };

  const sellItem = (item: Item) => {
    const srd = SRD_ITEMS.find(s => s.name === item.name);
    const price = Math.max(1, Math.floor((srd?.cost || 1) * 0.5));
    const cur = { ...active.currency };
    cur.gp += price;
    update(active.id, { currency: cur });
    removeItem(active.id, item.name, 1);
    coinSfx();
    showToast(`Sold ${item.name} for ${price}gp`, 'success');
  };

  const filteredSrd = useMemo(() => {
    return SRD_ITEMS.filter(s => s.category === tab && (!pickerSearch || s.name.toLowerCase().includes(pickerSearch.toLowerCase())));
  }, [tab, pickerSearch]);

  const libraryWeapons = useMemo(() => {
    return SRD_ITEMS.filter(s => s.category === 'weapon' && (!pickerSearch || s.name.toLowerCase().includes(pickerSearch.toLowerCase())));
  }, [pickerSearch]);

  return (
    <div className="p-3">
      <div className="card-gold mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="label">Coin purse</div>
          <button onClick={() => setAutoConvert(!autoConvert)} className="text-[11px]" style={{ color: autoConvert ? 'var(--accent)' : 'var(--text-muted)' }}>{autoConvert ? '⇄ auto' : 'manual'}</button>
        </div>
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {(['pp','gp','ep','sp','cp'] as const).map(k => (
            <CurrencyCell key={k} kind={k} value={active.currency[k]} onChange={(v) => {
              const cur = { ...active.currency, [k]: Math.max(0, v) };
              if (autoConvert) cur.gp = cur.gp;
              update(active.id, { currency: cur });
            }} />
          ))}
        </div>
        <div className="mt-2 text-[11px] text-right" style={{ color: 'var(--text-muted)' }}>Total weight: {total.toFixed(1)} lb</div>
      </div>

      <div className="flex gap-1 overflow-x-auto mb-2" style={{ scrollbarWidth: 'none' }}>
        {CATS.map(c => {
          const count = active.inventory.filter(i => i.category === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className="shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1"
              style={{ background: tab === c.id ? 'var(--accent)' : 'var(--surface-2)', color: tab === c.id ? '#1a1a1a' : 'var(--text)' }}
            >{c.icon} {c.label} {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}</button>
          );
        })}
      </div>

      {tab === 'weapon' && (
        <div className="flex gap-1 mb-2">
          {([['my','⚔ Mine'],['library','📚 Library'],['custom','✨ Custom']] as const).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => { if (k === 'custom') { setCustomOpen(true); } else { setWeaponView(k as any); setPickerSearch(''); } }}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: weaponView === k ? 'var(--accent)' : 'var(--surface-2)', color: weaponView === k ? '#1a1a1a' : 'var(--text)' }}
            >{lbl}</button>
          ))}
        </div>
      )}

      {tab !== 'weapon' && (
        <div className="flex gap-2 mb-2">
          <button className="btn btn-primary flex-1 text-sm" onClick={() => setPickerOpen(true)}>+ Buy from shop</button>
          <button className="btn btn-ghost flex-1 text-sm" onClick={() => setCustomOpen(true)}>+ Custom</button>
        </div>
      )}

      {tab === 'weapon' && weaponView === 'my' && (
        <div className="space-y-1">
          {items.length === 0 ? (
            <div className="card text-center text-sm py-6" style={{ color: 'var(--text-muted)' }}>No weapons yet. Check the Library or add a Custom one.</div>
          ) : items.map(i => <InventoryRow key={i.id} item={i} onEquip={() => { toggleEquip(active.id, i.id); haptics(8); }} onSell={() => sellItem(i)} />)}
        </div>
      )}

      {tab === 'weapon' && weaponView === 'library' && (
        <div>
          <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Search weapons…" className="text-sm mb-2" />
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {libraryWeapons.length === 0 ? (
              <div className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>No matches.</div>
            ) : libraryWeapons.map((s, i) => (
              <div key={i} className="card flex items-center gap-2 text-sm">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}>⚔</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{s.name}</div>
                  <div className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {s.damage ? `${s.damage.dice} ${s.damage.type}` : '—'}
                    {s.range ? ` · ${s.range}` : ''}
                    {s.properties?.length ? ` · ${s.properties.join(', ')}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm" style={{ color: 'var(--accent)' }}>{(s.cost || 0)}gp</div>
                  <button onClick={() => buyItem(s)} className="text-[10px] px-2 py-0.5 rounded mt-1" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>Add</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab !== 'weapon' && items.length === 0 ? (
        <div className="card text-center text-sm py-6" style={{ color: 'var(--text-muted)' }}>No {CATS.find(c => c.id === tab)?.label.toLowerCase()} yet.</div>
      ) : tab !== 'weapon' && items.map(i => <InventoryRow key={i.id} item={i} onEquip={() => { toggleEquip(active.id, i.id); haptics(8); }} onSell={() => sellItem(i)} />)}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-[480px] max-h-[80vh] flex flex-col rounded-t-2xl sm:rounded-2xl m-0 sm:m-3" style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }} onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-display text-lg" style={{ color: 'var(--accent)' }}>Buy: {CATS.find(c => c.id === tab)?.label}</div>
                <button onClick={() => setPickerOpen(false)} className="text-xl">×</button>
              </div>
              <input placeholder="Search…" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} />
            </div>
            <div className="overflow-y-auto p-2 space-y-1">
              {filteredSrd.length === 0 ? (
                <div className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>No matches.</div>
              ) : filteredSrd.map((s, i) => (
                <div key={i} className="card flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{s.name}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {s.damage ? `${s.damage.dice} ${s.damage.type} · ` : ''}
                      {s.ac ? `AC ${s.ac} · ` : ''}
                      {s.properties?.join(', ')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm" style={{ color: 'var(--accent)' }}>{(s.cost || 0)}gp</div>
                    <button onClick={() => buyItem(s)} className="text-[10px] px-2 py-0.5 rounded mt-1" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>Buy</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {customOpen && (
        tab === 'weapon' ? (
          <CustomWeaponModal
            onClose={() => setCustomOpen(false)}
            onSave={(w) => {
              addItem(active.id, { ...w, category: 'weapon' } as any);
              showToast(`Forged ${w.name}`, 'success');
              setCustomOpen(false);
              setWeaponView('my');
            }}
          />
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setCustomOpen(false)}>
            <div className="w-full max-w-[400px] m-3 p-4 rounded-2xl" style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }} onClick={e => e.stopPropagation()}>
              <div className="font-display text-lg mb-2" style={{ color: 'var(--accent)' }}>Add custom item</div>
              <div className="space-y-2">
                <input placeholder="Name" value={cn} onChange={e => setCn(e.target.value)} />
                <div className="flex gap-2">
                  <input type="number" min={1} placeholder="Qty" value={cq} onChange={e => setCq(Math.max(1, parseInt(e.target.value) || 1))} />
                  <select value={ccat} onChange={e => setCcat(e.target.value as ItemCategory)}>
                    {CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost flex-1" onClick={() => setCustomOpen(false)}>Cancel</button>
                  <button className="btn btn-primary flex-1" onClick={() => { if (!cn.trim()) return; addItem(active.id, { name: cn.trim(), qty: cq, weight: 0, category: ccat }); setCustomOpen(false); setCn(''); setCq(1); }}>Add</button>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

const InventoryRow = ({ item, onEquip, onSell }: { item: Item; onEquip: () => void; onSell: () => void }) => (
  <div className="card flex items-center gap-2 text-sm">
    <div className="flex-1 min-w-0">
      <div className="font-semibold truncate">
        {item.name} {item.qty > 1 && <span style={{ color: 'var(--text-muted)' }}>×{item.qty}</span>}
        {item.equipped && <span className="ml-1 text-[10px]" style={{ color: 'var(--accent)' }}>•EQUIPPED</span>}
      </div>
      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {item.damage ? `${item.damage.dice} ${item.damage.type}` : ''}
        {item.range ? ` · ${item.range}` : ''}
        {item.ac ? `AC ${item.ac}` : ''}
        {item.properties?.length ? ` · ${item.properties.slice(0, 3).join(', ')}` : ''}
        {item.weight > 0 ? ` · ${item.weight * item.qty} lb` : ''}
        {item.rarity && item.rarity !== 'common' ? ` · ${item.rarity}` : ''}
      </div>
    </div>
    <div className="flex flex-col gap-1">
      {(item.category === 'weapon' || item.category === 'armor') && (
        <button onClick={onEquip} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)' }}>{item.equipped ? 'Unequip' : 'Equip'}</button>
      )}
      <button onClick={onSell} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}>Sell</button>
    </div>
  </div>
);

const CurrencyCell = ({ kind, value, onChange }: { kind: keyof Currency; value: number; onChange: (v: number) => void }) => (
  <div className="rounded p-1.5" style={{ background: 'var(--surface-2)' }}>
    <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--accent)' }}>{kind}</div>
    <input
      type="number"
      value={value}
      onChange={e => onChange(parseInt(e.target.value) || 0)}
      className="w-full text-center text-base font-mono p-0 border-0 bg-transparent"
    />
  </div>
);

const canAfford = (cur: Currency, gpAmount: number): boolean => {
  const totalCP = cur.pp * 1000 + cur.gp * 100 + cur.ep * 50 + cur.sp * 10 + cur.cp;
  return totalCP >= gpAmount * 100;
};

const subtractCost = (cur: Currency, gpAmount: number): Currency => {
  let cp = cur.pp * 1000 + cur.gp * 100 + cur.ep * 50 + cur.sp * 10 + cur.cp - gpAmount * 100;
  if (cp < 0) cp = 0;
  const pp = Math.floor(cp / 1000); cp -= pp * 1000;
  const gp = Math.floor(cp / 100); cp -= gp * 100;
  const ep = Math.floor(cp / 50); cp -= ep * 50;
  const sp = Math.floor(cp / 10); cp -= sp * 10;
  return { pp, gp, ep, sp, cp };
};

const CustomWeaponModal = ({ onClose, onSave }: { onClose: () => void; onSave: (w: Omit<Item, 'id'>) => void }) => {
  const [name, setName] = useState('');
  const [dice, setDice] = useState('1d8');
  const [damageType, setDamageType] = useState<DamageType>('slashing');
  const [range, setRange] = useState('5 ft');
  const [weight, setWeight] = useState(3);
  const [cost, setCost] = useState(10);
  const [properties, setProperties] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [rarity, setRarity] = useState<'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary'>('common');

  const toggleProp = (p: string) => setProperties(arr => arr.includes(p) ? arr.filter(x => x !== p) : [...arr, p]);

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(), qty: 1, weight, category: 'weapon',
      damage: { dice, type: damageType }, range, properties, rarity,
      notes: notes.trim() || undefined, equipped: false
    } as any);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-[480px] max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl m-0 sm:m-3" style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }} onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <div className="font-display text-lg" style={{ color: 'var(--accent)' }}>Forge custom weapon</div>
          <button onClick={onClose} className="text-xl">×</button>
        </div>
        <div className="p-3 space-y-3 overflow-y-auto">
          <div>
            <div className="label">Name</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Frostbite, the cursed longsword" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="label">Damage dice</div>
              <input value={dice} onChange={e => setDice(e.target.value)} placeholder="1d8, 2d6+1, etc." />
            </div>
            <div>
              <div className="label">Damage type</div>
              <select value={damageType} onChange={e => setDamageType(e.target.value as DamageType)}>
                {WEAPON_DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="label">Range</div>
              <input value={range} onChange={e => setRange(e.target.value)} placeholder="5 ft" />
            </div>
            <div>
              <div className="label">Weight (lb)</div>
              <input type="number" min={0} step={0.5} value={weight} onChange={e => setWeight(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <div className="label">Cost (gp)</div>
              <input type="number" min={0} step={0.5} value={cost} onChange={e => setCost(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <div className="label">Rarity</div>
            <select value={rarity} onChange={e => setRarity(e.target.value as any)}>
              <option value="common">common</option>
              <option value="uncommon">uncommon</option>
              <option value="rare">rare</option>
              <option value="very rare">very rare</option>
              <option value="legendary">legendary</option>
            </select>
          </div>
          <div>
            <div className="label mb-1">Properties</div>
            <div className="flex flex-wrap gap-1">
              {WEAPON_PROPERTIES.map(p => (
                <button
                  key={p}
                  onClick={() => toggleProp(p)}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: properties.includes(p) ? 'var(--accent)' : 'var(--surface-2)', color: properties.includes(p) ? '#1a1a1a' : 'var(--text)' }}
                >{p}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">Lore / notes (the AI will read this)</div>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="A pale-blue blade said to weep when its wielder is near death. On a crit, the target must save vs Cold or be chilled for 1 round." />
          </div>
        </div>
        <div className="sticky bottom-0 p-3 border-t flex gap-2" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-1" onClick={submit} disabled={!name.trim()}>✨ Add to inventory</button>
        </div>
      </div>
    </div>
  );
};
