export const SRD_ITEMS: {
  name: string;
  category: 'weapon' | 'armor' | 'gear' | 'tool' | 'consumable';
  weight: number;
  cost?: number;
  damage?: { dice: string; type: string };
  ac?: number;
  properties?: string[];
  range?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary';
}[] = [
  // Simple Melee Weapons
  { name: 'Club', category: 'weapon', weight: 2, cost: 0.1, damage: { dice: '1d4', type: 'bludgeoning' }, properties: ['light'], range: '5 ft' },
  { name: 'Dagger', category: 'weapon', weight: 1, cost: 2, damage: { dice: '1d4', type: 'piercing' }, properties: ['finesse', 'light', 'thrown'], range: '20/60' },
  { name: 'Greatclub', category: 'weapon', weight: 10, cost: 0.2, damage: { dice: '1d8', type: 'bludgeoning' }, properties: ['two-handed'], range: '5 ft' },
  { name: 'Handaxe', category: 'weapon', weight: 2, cost: 5, damage: { dice: '1d6', type: 'slashing' }, properties: ['light', 'thrown'], range: '20/60' },
  { name: 'Javelin', category: 'weapon', weight: 2, cost: 0.5, damage: { dice: '1d6', type: 'piercing' }, properties: ['thrown'], range: '30/120' },
  { name: 'Light Hammer', category: 'weapon', weight: 2, cost: 2, damage: { dice: '1d4', type: 'bludgeoning' }, properties: ['light', 'thrown'], range: '20/60' },
  { name: 'Mace', category: 'weapon', weight: 4, cost: 5, damage: { dice: '1d6', type: 'bludgeoning' }, range: '5 ft' },
  { name: 'Quarterstaff', category: 'weapon', weight: 4, cost: 0.2, damage: { dice: '1d6', type: 'bludgeoning' }, properties: ['versatile (1d8)'], range: '5 ft' },
  { name: 'Sickle', category: 'weapon', weight: 2, cost: 1, damage: { dice: '1d4', type: 'slashing' }, properties: ['light'], range: '5 ft' },
  { name: 'Spear', category: 'weapon', weight: 3, cost: 1, damage: { dice: '1d6', type: 'piercing' }, properties: ['thrown', 'versatile (1d8)'], range: '20/60' },
  // Simple Ranged
  { name: 'Light Crossbow', category: 'weapon', weight: 5, cost: 25, damage: { dice: '1d8', type: 'piercing' }, properties: ['ammunition', 'loading', 'two-handed'], range: '80/320' },
  { name: 'Dart', category: 'weapon', weight: 0.25, cost: 0.05, damage: { dice: '1d4', type: 'piercing' }, properties: ['finesse', 'thrown'], range: '20/60' },
  { name: 'Shortbow', category: 'weapon', weight: 2, cost: 25, damage: { dice: '1d6', type: 'piercing' }, properties: ['ammunition', 'range', 'two-handed'], range: '80/320' },
  { name: 'Sling', category: 'weapon', weight: 0, cost: 0.1, damage: { dice: '1d4', type: 'bludgeoning' }, properties: ['ammunition', 'range'], range: '30/120' },
  // Martial Melee
  { name: 'Battleaxe', category: 'weapon', weight: 4, cost: 10, damage: { dice: '1d8', type: 'slashing' }, properties: ['versatile (1d10)'], range: '5 ft' },
  { name: 'Flail', category: 'weapon', weight: 2, cost: 10, damage: { dice: '1d8', type: 'bludgeoning' }, range: '5 ft' },
  { name: 'Glaive', category: 'weapon', weight: 6, cost: 20, damage: { dice: '1d10', type: 'slashing' }, properties: ['heavy', 'reach', 'two-handed'], range: '5 ft' },
  { name: 'Greataxe', category: 'weapon', weight: 7, cost: 30, damage: { dice: '1d12', type: 'slashing' }, properties: ['heavy', 'two-handed'], range: '5 ft' },
  { name: 'Greatsword', category: 'weapon', weight: 6, cost: 50, damage: { dice: '2d6', type: 'slashing' }, properties: ['heavy', 'two-handed'], range: '5 ft' },
  { name: 'Halberd', category: 'weapon', weight: 6, cost: 20, damage: { dice: '1d10', type: 'slashing' }, properties: ['heavy', 'reach', 'two-handed'], range: '5 ft' },
  { name: 'Lance', category: 'weapon', weight: 6, cost: 10, damage: { dice: '1d12', type: 'piercing' }, properties: ['reach', 'special'], range: '5 ft' },
  { name: 'Longsword', category: 'weapon', weight: 3, cost: 15, damage: { dice: '1d8', type: 'slashing' }, properties: ['versatile (1d10)'], range: '5 ft' },
  { name: 'Maul', category: 'weapon', weight: 10, cost: 10, damage: { dice: '2d6', type: 'bludgeoning' }, properties: ['heavy', 'two-handed'], range: '5 ft' },
  { name: 'Morningstar', category: 'weapon', weight: 4, cost: 15, damage: { dice: '1d8', type: 'piercing' }, range: '5 ft' },
  { name: 'Pike', category: 'weapon', weight: 18, cost: 5, damage: { dice: '1d10', type: 'piercing' }, properties: ['heavy', 'reach', 'two-handed'], range: '5 ft' },
  { name: 'Rapier', category: 'weapon', weight: 2, cost: 25, damage: { dice: '1d8', type: 'piercing' }, properties: ['finesse'], range: '5 ft' },
  { name: 'Scimitar', category: 'weapon', weight: 3, cost: 25, damage: { dice: '1d6', type: 'slashing' }, properties: ['finesse', 'light'], range: '5 ft' },
  { name: 'Shortsword', category: 'weapon', weight: 2, cost: 10, damage: { dice: '1d6', type: 'piercing' }, properties: ['finesse', 'light'], range: '5 ft' },
  { name: 'Trident', category: 'weapon', weight: 4, cost: 5, damage: { dice: '1d6', type: 'piercing' }, properties: ['thrown', 'versatile (1d8)'], range: '20/60' },
  { name: 'War Pick', category: 'weapon', weight: 2, cost: 5, damage: { dice: '1d8', type: 'piercing' }, range: '5 ft' },
  { name: 'Warhammer', category: 'weapon', weight: 2, cost: 15, damage: { dice: '1d8', type: 'bludgeoning' }, properties: ['versatile (1d10)'], range: '5 ft' },
  { name: 'Whip', category: 'weapon', weight: 3, cost: 2, damage: { dice: '1d4', type: 'slashing' }, properties: ['finesse', 'reach'], range: '5 ft' },
  // Martial Ranged
  { name: 'Blowgun', category: 'weapon', weight: 1, cost: 10, damage: { dice: '1', type: 'piercing' }, properties: ['ammunition', 'loading'], range: '25/100' },
  { name: 'Hand Crossbow', category: 'weapon', weight: 3, cost: 75, damage: { dice: '1d6', type: 'piercing' }, properties: ['ammunition', 'light', 'loading'], range: '30/120' },
  { name: 'Heavy Crossbow', category: 'weapon', weight: 18, cost: 50, damage: { dice: '1d10', type: 'piercing' }, properties: ['ammunition', 'heavy', 'loading', 'two-handed'], range: '100/400' },
  { name: 'Longbow', category: 'weapon', weight: 2, cost: 50, damage: { dice: '1d8', type: 'piercing' }, properties: ['ammunition', 'range', 'two-handed', 'heavy'], range: '150/600' },
  { name: 'Net', category: 'weapon', weight: 3, cost: 1, properties: ['thrown', 'special'], range: '5/15' },
  { name: 'Padded Armor', category: 'armor', weight: 8, cost: 5, ac: 11 },
  { name: 'Leather Armor', category: 'armor', weight: 10, cost: 10, ac: 11 },
  { name: 'Studded Leather', category: 'armor', weight: 13, cost: 45, ac: 12 },
  { name: 'Chain Shirt', category: 'armor', weight: 20, cost: 50, ac: 13 },
  { name: 'Scale Mail', category: 'armor', weight: 45, cost: 50, ac: 14 },
  { name: 'Breastplate', category: 'armor', weight: 20, cost: 400, ac: 14 },
  { name: 'Chain Mail', category: 'armor', weight: 55, cost: 75, ac: 16 },
  { name: 'Plate', category: 'armor', weight: 65, cost: 1500, ac: 18 },
  { name: 'Shield', category: 'armor', weight: 6, cost: 10, ac: 2 },
  { name: 'Healing Potion', category: 'consumable', weight: 0.5, cost: 50, rarity: 'common' },
  { name: 'Greater Healing Potion', category: 'consumable', weight: 0.5, cost: 150, rarity: 'uncommon' },
  { name: 'Superior Healing Potion', category: 'consumable', weight: 0.5, cost: 450, rarity: 'rare' },
  { name: 'Antitoxin (vial)', category: 'consumable', weight: 0, cost: 50 },
  { name: "Alchemist's Fire", category: 'consumable', weight: 1, cost: 50 },
  { name: 'Rope, hempen (50 ft)', category: 'gear', weight: 10, cost: 1 },
  { name: 'Torch', category: 'gear', weight: 1, cost: 0.01 },
  { name: 'Lantern, hooded', category: 'gear', weight: 2, cost: 5 },
  { name: 'Bedroll', category: 'gear', weight: 7, cost: 1 },
  { name: 'Rations (1 day)', category: 'gear', weight: 2, cost: 0.5 },
  { name: "Explorer's Pack", category: 'gear', weight: 0, cost: 10 },
  { name: "Burglar's Pack", category: 'gear', weight: 0, cost: 16 },
  { name: 'Spellbook', category: 'gear', weight: 3, cost: 50 },
  { name: "Thieves' Tools", category: 'tool', weight: 1, cost: 25 },
  { name: "Herbalism Kit", category: 'tool', weight: 3, cost: 5 },
  { name: "Disguise Kit", category: 'tool', weight: 3, cost: 25 },
  { name: "Gaming Set (dice)", category: 'tool', weight: 0, cost: 0.1 }
];

export const WEAPON_DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'radiant', 'necrotic', 'psychic', 'force'] as const;

export const CONSUMABLE_NAMES = ['Healing Potion', 'Greater Healing Potion', 'Superior Healing Potion', 'Antitoxin (vial)', "Alchemist's Fire"];
