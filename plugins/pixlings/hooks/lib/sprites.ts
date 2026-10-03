// Species art: 16×16 palette grids. `.` is transparent; every other character is a key of the
// species palette. Eyes, mouths, cheeks and hats are drawn on top by canvas.ts at the anchors
// below, so one body serves every mood.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export type Voice = 'high' | 'mid' | 'low' | 'wobble'

export type Point = readonly [x: number, y: number]

export type Species = {
  readonly id: string
  readonly name: string
  readonly rarity: Rarity
  readonly art: readonly string[]
  readonly palette: Readonly<Record<string, number>>
  readonly shiny: Readonly<Record<string, number>>
  /** Top-left pixel of each eye. */
  readonly eyes: readonly Point[]
  /** Eye size in pixels: [width, height]. */
  readonly eyeSize: readonly [number, number]
  /** Eye color (dark for most, glowing for the robot). */
  readonly eyeColor: number
  /** Eye color on the shiny palette, where dark eyes would vanish into a dark body. */
  readonly shinyEyeColor?: number
  /** Left pixel of a 4-wide mouth, or null where a beak stands in. */
  readonly mouth: Point | null
  readonly cheeks: readonly Point[]
  /** Where a hat sits: the head's center column and its top row. */
  readonly head: Point
  /** Rows swapped every other beat (a ghost's hem). */
  readonly wiggle?: { readonly row: number; readonly frames: readonly string[] }[]
  readonly voice: Voice
  /** Spinner words while Claude works. */
  readonly verbs: readonly string[]
  /** The past-tense word on the line that closes a turn ("Quacked for 12s"). */
  readonly past: readonly string[]
  readonly blurb: string
}

export const RARITY_ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

export const RARITY_WEIGHT: Readonly<Record<Rarity, number>> = {
  common: 50,
  uncommon: 28,
  rare: 14,
  epic: 6.5,
  legendary: 1.5,
}

export const RARITY_STARS: Readonly<Record<Rarity, string>> = {
  common: '★',
  uncommon: '★★',
  rare: '★★★',
  epic: '★★★★',
  legendary: '★★★★★',
}

export const RARITY_COLOR: Readonly<Record<Rarity, number>> = {
  common: 0xb8c2cc,
  uncommon: 0x6fdc8c,
  rare: 0x5aa9ff,
  epic: 0xc77dff,
  legendary: 0xffc53d,
}

const DARK_EYE = 0x1b1424

export const SPECIES: readonly Species[] = [
  {
    id: 'blip',
    name: 'Blip',
    rarity: 'common',
    art: [
      '................',
      '................',
      '................',
      '................',
      '......KKKK......',
      '....KKLLLBKK....',
      '...KLLBBBBBBK...',
      '..KLBBBBBBBBBK..',
      '..KLBBBBBBBBBK..',
      '.KBBBBBBBBBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '.KBBBBBBBBBBBSK.',
      '.KBBBBBBBBBBSSK.',
      '..KSBBBBBBBSSK..',
      '...KKKKKKKKKK...',
      '................',
    ],
    palette: { K: 0x1f5e3a, B: 0x5fcf7a, L: 0xb4f5c0, S: 0x3fa35c },
    shiny: { K: 0x4a1f63, B: 0xc77dff, L: 0xeed4ff, S: 0x9b4fd9 },
    eyes: [
      [5, 8],
      [9, 8],
    ],
    eyeSize: [2, 2],
    eyeColor: DARK_EYE,
    mouth: [6, 11],
    cheeks: [
      [3, 10],
      [12, 10],
    ],
    head: [8, 4],
    voice: 'mid',
    verbs: ['Blipping', 'Wobbling', 'Jiggling', 'Absorbing', 'Squishing'],
    past: ['Blipped', 'Wobbled', 'Squished'],
    blurb: 'A cheerful blob of pure enthusiasm. Absorbs knowledge, and occasionally snacks.',
  },
  {
    id: 'duck',
    name: 'Duck',
    rarity: 'common',
    art: [
      '................',
      '.......KK.......',
      '.....KKBKKK.....',
      '....KLBBBBBK....',
      '...KLBBBBBBBK...',
      '...KBBBBBBBBK...',
      '...KBBBBBBBBK...',
      '...KBBAAAABBK...',
      '...KBAAAAAABK...',
      '..KKBBAAAABBKK..',
      '.KBBKBBBBBBKBBK.',
      'KBLBBKBBBBKBBBSK',
      'KBBBBBBBBBBBBBSK',
      'KSBBBBBBBBBBBSSK',
      '.KSSSSSSSSSSSSK.',
      '..KKKKKKKKKKKK..',
    ],
    palette: { K: 0x7a4a12, B: 0xffd84a, L: 0xfff3b0, S: 0xe0a92a, A: 0xff8a2a },
    shiny: { K: 0x1e3a7a, B: 0x7cc0ff, L: 0xd8ecff, S: 0x3f86d9, A: 0xffa23a },
    eyes: [
      [5, 5],
      [9, 5],
    ],
    eyeSize: [2, 2],
    eyeColor: DARK_EYE,
    mouth: null,
    cheeks: [
      [4, 7],
      [11, 7],
    ],
    head: [8, 1],
    voice: 'high',
    verbs: ['Quacking', 'Rubber-ducking', 'Listening intently', 'Floating', 'Debugging out loud'],
    past: ['Quacked', 'Floated', 'Rubber-ducked'],
    blurb: 'Every bug ever fixed was explained to a duck first. This one listens back.',
  },
  {
    id: 'cat',
    name: 'Cat',
    rarity: 'common',
    art: [
      '................',
      '..KK........KK..',
      '..KAK......KAK..',
      '..KAAKKKKKKAAK..',
      '..KBLBBBBBBBBK..',
      '.KBLBBBBBBBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '.KBBBBBBBBBBBSK.',
      '..KBBBBBBBBBSK..',
      '...KKBBBBBBKK.K.',
      '...KBBBBBBBBKKBK',
      '...KBBBBBBBSKBK.',
      '...KBKBBBBKSKK..',
      '...KKKKKKKKKK...',
    ],
    palette: { K: 0x3b2a3f, B: 0xf3a65a, L: 0xffd3a1, S: 0xc77a35, A: 0xff9eb5 },
    shiny: { K: 0x15151f, B: 0x4e5373, L: 0x8a90b8, S: 0x343850, A: 0x9ef0ff },
    shinyEyeColor: 0xffd23f,
    eyes: [
      [4, 6],
      [10, 6],
    ],
    eyeSize: [2, 2],
    eyeColor: DARK_EYE,
    mouth: [6, 8],
    cheeks: [
      [3, 8],
      [12, 8],
    ],
    head: [8, 3],
    voice: 'high',
    verbs: ['Knocking things off desks', 'Purring', 'Judging', 'Napping on the keyboard'],
    past: ['Purred', 'Pounced', 'Judged'],
    blurb: 'Sits on your keyboard, judges your variable names, purrs when tests pass.',
  },
  {
    id: 'robot',
    name: 'Robot',
    rarity: 'uncommon',
    art: [
      '.......AA.......',
      '.......KK.......',
      '...KKKKKKKKKK...',
      '...KLLLLLLLLK...',
      '...KLDDDDDDBK...',
      '..KKLDDDDDDBKK..',
      '..KKLDDDDDDBKK..',
      '...KLDDDDDDBK...',
      '...KBBBBBBBBK...',
      '...KSSSSSSSSK...',
      '....KKKKKKKK....',
      '..KKBBBBBBBBKK..',
      '.KBKBBAABBBBKBK.',
      '.KBKBBBBBBBSKBK.',
      '..K.KBBBBBSK.K..',
      '....KKK..KKK....',
    ],
    palette: { K: 0x232a3a, B: 0xa9b8cc, L: 0xe1e9f5, S: 0x7a8aa3, D: 0x10202c, A: 0xff4d6d },
    shiny: { K: 0x3a2a10, B: 0xe8c25a, L: 0xfff1bf, S: 0xb88a2a, D: 0x2a1408, A: 0x4dffb8 },
    eyes: [
      [6, 5],
      [9, 5],
    ],
    eyeSize: [1, 2],
    eyeColor: 0x5cf2ff,
    mouth: [6, 7],
    cheeks: [],
    head: [8, 1],
    voice: 'mid',
    verbs: ['Computing', 'Beep-booping', 'Allocating', 'Compiling feelings', 'Overclocking'],
    past: ['Computed', 'Beep-booped', 'Compiled'],
    blurb: 'Runs on coffee-flavored electricity. Its antenna blinks when it has an idea.',
  },
  {
    id: 'cactus',
    name: 'Cactus',
    rarity: 'uncommon',
    art: [
      '................',
      '......KKKK......',
      '....KKLLBBKK....',
      '...KLLBBBBBBK...',
      '...KLBBBBBBBK...',
      '.K.KLBBBBBBBK.K.',
      'KBKKBBBBBBBBKKBK',
      'KBBKBBBBBBBBKBBK',
      '.KBBBBBBBBBBBBK.',
      '..KKBBBBBBBSKK..',
      '...KBBBBBBBSK...',
      '.KPPPPPPPPPPPPK.',
      '.KQQQQQQQQQQQQK.',
      '..KPPPPPPPPPPK..',
      '..KPPPPPPPPPQK..',
      '...KKKKKKKKKK...',
    ],
    palette: {
      K: 0x1d4a2c,
      B: 0x4fae5c,
      L: 0x9be08f,
      S: 0x2f7d41,
      P: 0xd9744a,
      Q: 0xa8502f,
    },
    shiny: { K: 0x23304a, B: 0x6fa8ff, L: 0xc4dcff, S: 0x3d6fc4, P: 0xf2f2f2, Q: 0xb8b8c8 },
    eyes: [
      [5, 5],
      [9, 5],
    ],
    eyeSize: [2, 2],
    eyeColor: DARK_EYE,
    mouth: [6, 8],
    cheeks: [
      [4, 7],
      [11, 7],
    ],
    head: [8, 1],
    voice: 'low',
    verbs: ['Photosynthesizing', 'Growing slowly', 'Standing very still', 'Storing water'],
    past: ['Grew', 'Photosynthesized', 'Bloomed'],
    blurb: 'Low maintenance, high resilience. Blooms when your tests go green.',
  },
  {
    id: 'owl',
    name: 'Owl',
    rarity: 'rare',
    art: [
      '................',
      '..KK........KK..',
      '..KBK......KBK..',
      '..KBBKKKKKKBBK..',
      '.KBBBBBBBBBBBBK.',
      '.KWWWWBBBBWWWWK.',
      '.KWWWWBBBBWWWWK.',
      '.KWWWWBAABWWWWK.',
      '.KWWWWBAABWWWWK.',
      '.KSBBBBBBBBBBSK.',
      '.KSBLLLLLLLLBSK.',
      '.KSLLBLLBLLBLSK.',
      '..KSLLLLLLLLSK..',
      '..KSSLBLLBLSSK..',
      '...KSSSSSSSSK...',
      '....AA....AA....',
    ],
    palette: {
      K: 0x3a2618,
      B: 0x9a6b45,
      L: 0xf0dcb8,
      S: 0x6e4a2e,
      W: 0xfff1c9,
      A: 0xffa630,
    },
    shiny: {
      K: 0x2a2a38,
      B: 0xe8ecf5,
      L: 0xffffff,
      S: 0xb4bccf,
      W: 0xc9f0ff,
      A: 0xffd84a,
    },
    eyes: [
      [3, 6],
      [11, 6],
    ],
    eyeSize: [2, 2],
    eyeColor: DARK_EYE,
    mouth: null,
    cheeks: [],
    head: [8, 1],
    voice: 'low',
    verbs: ['Hooting', 'Reading the docs', 'Pulling an all-nighter', 'Being wise'],
    past: ['Hooted', 'Pondered', 'Studied'],
    blurb: 'Night shift specialist. Has read the entire documentation. Twice.',
  },
  {
    id: 'axolotl',
    name: 'Axolotl',
    rarity: 'rare',
    art: [
      '................',
      '................',
      '................',
      'A.A..KKKKKK..A.A',
      '.AA.KLLBBBBK.AA.',
      'AAAKLBBBBBBBKAAA',
      '..AKBBBBBBBBKA..',
      '.AAKBBBBBBBBKAA.',
      'A..KBBBBBBBBK..A',
      '...KBBBBBBBBK...',
      '...KSBBBBBBSK...',
      '....KKBBBBKK....',
      '...KBBLLLLBBK...',
      '..KBKBLLLLBKBK..',
      '..KKKSSSSSSKKK..',
      '.....KKKKKK.....',
    ],
    palette: { K: 0x8a3550, B: 0xffb3c7, L: 0xffe0ea, S: 0xe88aa5, A: 0xff5d8f },
    shiny: { K: 0x7a4a10, B: 0xffd27a, L: 0xfff0c4, S: 0xe0a440, A: 0xff8a3d },
    eyes: [
      [5, 6],
      [9, 6],
    ],
    eyeSize: [2, 2],
    eyeColor: DARK_EYE,
    mouth: [6, 9],
    cheeks: [
      [4, 8],
      [11, 8],
    ],
    head: [8, 3],
    voice: 'high',
    verbs: ['Regenerating', 'Smiling', 'Wiggling gills', 'Being adorable'],
    past: ['Regenerated', 'Wiggled', 'Smiled'],
    blurb: 'Can regrow a lost limb, so a lost branch is nothing. Smiles through every merge conflict.',
  },
  {
    id: 'ghost',
    name: 'Ghost',
    rarity: 'epic',
    art: [
      '................',
      '................',
      '.....KKKKKK.....',
      '...KKLLLLBBKK...',
      '..KLLBBBBBBBBK..',
      '..KLBBBBBBBBBK..',
      '.KLBBBBBBBBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '.KBBBBBBBBBBBSK.',
      '.KBBBBBBBBBBBSK.',
      '.KBBBBBBBBBBSSK.',
      '.KBSBBBSBBBSSSK.',
      '.KBK.KBBK.KBBK..',
      '..K...KK...KK...',
    ],
    palette: { K: 0x5b6b8c, B: 0xeef3ff, L: 0xffffff, S: 0xbac6e0 },
    shiny: { K: 0x2f6b4a, B: 0xc8ffd9, L: 0xf0fff4, S: 0x8fe0aa },
    wiggle: [
      { row: 14, frames: ['.KBK.KBBK.KBBK..', '..KBK.KBBK.KBBK.'] },
      { row: 15, frames: ['..K...KK...KK...', '...K...KK...KK..'] },
    ],
    eyes: [
      [5, 7],
      [9, 7],
    ],
    eyeSize: [2, 2],
    eyeColor: DARK_EYE,
    mouth: [6, 10],
    cheeks: [
      [3, 9],
      [12, 9],
    ],
    head: [8, 2],
    voice: 'wobble',
    verbs: ['Haunting', 'Possessing the codebase', 'Rattling chains', 'Phasing through walls'],
    past: ['Haunted', 'Spooked', 'Phased'],
    blurb: 'The ghost in your shell. Was a senior engineer once. Still reviews your PRs.',
  },
  {
    id: 'dragon',
    name: 'Dragon',
    rarity: 'legendary',
    art: [
      '................',
      '..H..........H..',
      '..HH.KKKKKK.HH..',
      '...HKLLBBBBKH...',
      '...KLBBBBBBBK...',
      'KM.KBBBBBBBBK.MK',
      'KMMKBBBBBBBBKMMK',
      'KMMKBBBBBBBBKMMK',
      '.KMKBBBBBBBBKMK.',
      '..KKBBBBBBBBKK..',
      '...KSBBBBBBSK...',
      '...KKBYYYYBKK...',
      '..KBKBYYYYBKBK..',
      '...KBBYYYYBBKBK.',
      '...KBBBBBBBBKK..',
      '....KKK..KKK....',
    ],
    palette: {
      K: 0x4a1010,
      B: 0xe0483e,
      L: 0xff8f73,
      S: 0xa82e2e,
      M: 0xff9f43,
      H: 0xfff0c8,
      Y: 0xffd27a,
    },
    shiny: {
      K: 0x0c0d16,
      B: 0x3a3f58,
      L: 0x6b7394,
      S: 0x23263a,
      M: 0xffd24a,
      H: 0xfff6d6,
      Y: 0xffd24a,
    },
    shinyEyeColor: 0xff3b3b,
    eyes: [
      [5, 6],
      [9, 6],
    ],
    eyeSize: [2, 2],
    eyeColor: DARK_EYE,
    mouth: [6, 9],
    cheeks: [
      [4, 8],
      [11, 8],
    ],
    head: [8, 2],
    voice: 'low',
    verbs: ['Hoarding tokens', 'Breathing fire', 'Guarding the main branch', 'Being legendary'],
    past: ['Hoarded', 'Scorched', 'Guarded'],
    blurb: 'Hoards tokens instead of gold. Guards the main branch with its life.',
  },
]

export const speciesById = (id: string): Species | undefined => SPECIES.find(s => s.id === id)

/** Problems in the art tables: wrong sizes, unknown palette keys, anchors off the grid. */
export const checkSpecies = (species: Species): string[] => {
  const problems: string[] = []
  if (species.art.length !== 16) {
    problems.push(`${species.id}: ${species.art.length} rows`)
  }
  const rows: { at: string; row: string }[] = species.art.map((row, y) => ({ at: `row ${y}`, row }))
  for (const w of species.wiggle ?? []) {
    w.frames.forEach((row, i) => rows.push({ at: `wiggle ${w.row}.${i}`, row }))
  }
  for (const { at, row } of rows) {
    if (row.length !== 16) {
      problems.push(`${species.id} ${at}: ${row.length} columns`)
    }
    for (const ch of row) {
      if (ch !== '.' && species.palette[ch] === undefined) {
        problems.push(`${species.id} ${at}: unknown key ${ch}`)
      }
    }
  }
  for (const key of Object.keys(species.palette)) {
    if (species.shiny[key] === undefined) {
      problems.push(`${species.id}: shiny lacks ${key}`)
    }
  }
  const points = [...species.eyes, ...species.cheeks, species.head, ...(species.mouth ? [species.mouth] : [])]
  for (const [x, y] of points) {
    if (x < 0 || x > 15 || y < 0 || y > 15) {
      problems.push(`${species.id}: anchor ${x},${y} off the grid`)
    }
  }
  return problems
}
