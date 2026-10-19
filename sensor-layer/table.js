// table.js: our State Table, row for row.
//
// signals: each 0 to 1, one owner each.
//   near   FW   how close the person is
//   still  JC   how little they moved in the last second
//   facing DO   how squarely they face the piece
//   open   BE   how open the eyes are
//
// states: checked top to bottom, the first row whose rule is true wins, so the
// rows that read a face come before the rows that read only distance. hold is in
// seconds: how long a rule has to stay true before the state changes.

window.TABLE = {
  signals: ['near', 'still', 'facing', 'open'],

  states: [
    // nobody is first, not last: its rule is specific (near reads 0 when there is
    // no face at all), and the 5 s hold means a dropped frame or a turned head
    // never empties the room.
    { name: 'nobody',       when: s => s.near < 0.05,                    hold: 5 },   // all four
    { name: 'turning-away', when: s => s.facing < 0.35 && s.near > 0.4,  hold: 2 },   // DO
    { name: 'widening',     when: s => s.open > 0.7 && s.near > 0.5,     hold: 1.5 }, // BE
    { name: 'holding',      when: s => s.still > 0.75 && s.near > 0.5,   hold: 3 },   // JC
    { name: 'arriving',     when: s => s.near > 0.6,                     hold: 1.5 }, // FW
    { name: 'passing',      when: s => s.near >= 0.15 && s.near <= 0.5,  hold: 1 },   // FW
  ],
};
