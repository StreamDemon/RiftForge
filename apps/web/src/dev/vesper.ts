/**
 * Dev seed: the same level-1 Ley Line Walker the rules and backend packages
 * pin in their tests. Feeds the "Create Vesper" button until the builder (#9)
 * can make real characters.
 */
export const vesper = {
  name: "Vesper",
  occId: "ley-line-walker",
  level: 1,
  attributes: { IQ: 18, ME: 16, MA: 12, PS: 16, PP: 20, PE: 14, PB: 11, Spd: 12 },
  hthType: "basic",
  psychicClass: "ordinary" as const,
  skills: [
    { skillId: "language-native-tongue", overrideValue: 98 },
    { skillId: "wilderness-survival", occBonus: 10 },
    { skillId: "math-basic", occBonus: 10 },
  ],
  spellIds: ["globe-of-daylight", "energy-bolt", "armor-of-ithan"],
};
